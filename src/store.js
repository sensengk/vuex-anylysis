import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert } from './util'

let Vue // bind on install
export class Store {
    constructor(options = {}) {
            debugger
            // Auto install if it is not done yet and `window` has `Vue`.
            // To allow users to avoid auto-installation in some cases,
            // this code should be placed here. See #731
            // 如果window.vue存在的话，安装vue.  可能用于script
            if (!Vue && typeof window !== 'undefined' && window.Vue) {
                install(window.Vue)
            }

            if (process.env.NODE_ENV !== 'production') {
                assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
                assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
                assert(this instanceof Store, `store must be called with the new operator.`)
            }
            // 解析出插件和严格模式。
            const {
                plugins = [],
                    strict = false
            } = options

            // store internal state
            // 标志一个提交状态， vuex中state的修改能只能在mutation的回调函数中。而不能在外部随意修改state.
            this._committing = false

            // 用来存储用户定义的所有actions
            this._actions = Object.create(null)
            this._actionSubscribers = []

            // 用来存储用户定义所有的 mutatins
            this._mutations = Object.create(null)

            // 用来存储用户定义所有的 getters
            this._wrappedGetters = Object.create(null)
            this._modules = new ModuleCollection(options)
            this._modulesNamespaceMap = Object.create(null)

            //用来存储所有对 mutation 变化的订阅者。
            this._subscribers = []

            // 主要是利用 Vue 实例方法 $watch 来观测变化的
            this._watcherVM = new Vue()

            // bind commit and dispatch to self
            const store = this
            const { dispatch, commit } = this
            this.dispatch = function boundDispatch(type, payload) {
                return dispatch.call(store, type, payload)
            }
            this.commit = function boundCommit(type, payload, options) {
                return commit.call(store, type, payload, options)
            }

            // strict mode
            this.strict = strict

            const state = this._modules.root.state

            // init root module.
            // this also recursively registers all sub-modules
            // and collects all module getters inside this._wrappedGetters
            installModule(this, state, [], this._modules.root)

            // initialize the store vm, which is responsible for the reactivity
            // (also registers _wrappedGetters as computed properties)
            // resetStoreVM 方法是初始化 store._vm
            resetStoreVM(this, state)

            // apply plugins
            // plugin接受的是一个函数，然后把store传入。
            plugins.forEach(plugin => plugin(this))

            // vuex是否传入开发工具， 如果传入则使用， 否则使用vue配置的开发工具
            const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
            if (useDevtools) {
                devtoolPlugin(this)
            }
        }
        // 获取state 状态。
    get state() {
        return this._vm._data.$$state
    }

    set state(v) {
        if (process.env.NODE_ENV !== 'production') {
            assert(false, `use store.replaceState() to explicit replace store state.`)
        }
    }

    commit(_type, _payload, _options) {
        // check object-style commit
        // 获取type payload, options 的值。
        const {
            type,
            payload,
            options
        } = unifyObjectStyle(_type, _payload, _options)

        const mutation = { type, payload }
            // 获取加工成数组的mutations
        const entry = this._mutations[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown mutation type: ${type}`)
            }
            return
        }
        // 根据获取的mutations, 进行执行。传入payload
        this._withCommit(() => {
            // 遍历包装之后的mutaions，然后把payload,传进去。
            entry.forEach(function commitIterator(handler) {
                handler(payload)
            })
        })

        // 原来 Vuex 的 Store 实例提供了 subscribe API 接口，它的作用是订阅（注册监听） store 的 mutation
        this._subscribers.forEach(sub => sub(mutation, this.state))

        if (
            process.env.NODE_ENV !== 'production' &&
            options && options.silent
        ) {
            console.warn(
                `[vuex] mutation type: ${type}. Silent option has been removed. ` +
                'Use the filter functionality in the vue-devtools'
            )
        }
    }

    dispatch(_type, _payload) {
        // check object-style dispatch
        const {
            type,
            payload
        } = unifyObjectStyle(_type, _payload)

        const action = { type, payload }
            // 解构获取分发的actions
        const entry = this._actions[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown action type: ${type}`)
            }
            return
        }
        // 使用发布订阅者模式。 推送action ， 和 state.
        this._actionSubscribers.forEach(sub => sub(action, this.state))
            // 如果有多个action, 使用Promise 进行同时请求，同时返回。
        return entry.length > 1 ?
            Promise.all(entry.map(handler => handler(payload))) :
            entry[0](payload)
    }

    /**
     * @desc 接受的参数是一个回调函数 把这个回调函数保存到this._subscribers上。 并返回一个函数。
     * @param {fn} fn 
     * @return {Function}
     */
    subscribe(fn) {
        return genericSubscribe(fn, this._subscribers)
    }

    /**
     * @desc 插入一个action到订阅者数组_actionSubscribers里面， 返回一个删除该函数的方法。
     * @param {fn} fn 
     * @return {Function}
     */
    subscribeAction(fn) {
        return genericSubscribe(fn, this._actionSubscribers)
    }

    /**
     * @desc watch 作用是响应式的监测一个 getter 方法的返回值，当值改变时调用回调。
     * getter 接收 store 的 state 作为唯一参数
     * @param {Function} getter 
     * @param {Function} cb 
     * @param {*} options 
     */
    watch(getter, cb, options) {
        if (process.env.NODE_ENV !== 'production') {
            assert(typeof getter === 'function', `store.watch only accepts a function.`)
        }
        return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
    }

    /**
     * @desc 传入的state来替代vm上的state, 进行数据变化。replaceState的作用是替换整个 rootState 一般在用于调试
     * @param {Object} state 
     */
    replaceState(state) {
        this._withCommit(() => {
            this._vm._data.$$state = state
        })
    }

    /**
     * @desc 注册一个模块。
     * @param {String|Array} path 
     * @param {Object} rawModule 
     * @param {*} options 
     */
    registerModule(path, rawModule, options = {}) {
        // 如果传入的路径是String, 把他转化为数组。
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
            assert(path.length > 0, 'cannot register the root module by using registerModule.')
        }
        // 根据相关的路径注册这个模块
        this._modules.register(path, rawModule)

        // 安装模块，并且重新重置modules
        installModule(this, this.state, path, this._modules.get(path), options.preserveState)
            // reset store to update getters...
        resetStoreVM(this, this.state)
    }

    /**
     * @desc 移除某个模块。
     * @param {String|Array} path 
     */
    unregisterModule(path) {
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
        }

        // 模块本身解注册。
        this._modules.unregister(path)

        // 在相关的路径删除state
        this._withCommit(() => {
            const parentState = getNestedState(this.state, path.slice(0, -1))
            Vue.delete(parentState, path[path.length - 1])
        })

        // 重新设置Store
        resetStore(this)
    }

    hotUpdate(newOptions) {
        // 更新模块上的数据， 然后重新设置Store
        this._modules.update(newOptions)
        resetStore(this, true)
    }

    /**
     * @desc vuex中所有对state的更改都用_withcommit函数包装，保证在同步修改state的过程中，this._commiting 为true.
     *  这样当我们观测state的变化， 如果this._commiting不为true.则能检查这个状态的修改是有问题的。 
     * @param {*} fn 接受一个函数，并且执行
     */
    _withCommit(fn) {
        const committing = this._committing
        this._committing = true
        fn()
        this._committing = committing
    }
}

/**
 * @desc 插入某个函数到订阅者里面。
 * @param {*} fn 
 * @param {*} subs 
 * @return {Function} function
 */
function genericSubscribe(fn, subs) {
    if (subs.indexOf(fn) < 0) {
        subs.push(fn)
    }
    return () => {
        const i = subs.indexOf(fn)
        if (i > -1) {
            subs.splice(i, 1)
        }
    }
}

function resetStore(store, hot) {
    store._actions = Object.create(null)
    store._mutations = Object.create(null)
    store._wrappedGetters = Object.create(null)
    store._modulesNamespaceMap = Object.create(null)
    const state = store.state
        // init all modules
    installModule(store, state, [], store._modules.root, true)
        // reset vm
    resetStoreVM(store, state, hot)
}

function resetStoreVM(store, state, hot) {
    debugger
    const oldVm = store._vm

    // bind store public getters
    // 绑定 store的公共getters
    // 通过defineProperty定义getters的一些属性。 而get
    store.getters = {}
    const wrappedGetters = store._wrappedGetters
    const computed = {}
    forEachValue(wrappedGetters, (fn, key) => {
        // use computed to leverage its lazy-caching mechanism
        computed[key] = () => fn(store)
        Object.defineProperty(store.getters, key, {
            get: () => store._vm[key],
            enumerable: true // for local getters
        })
    })

    // use a Vue instance to store the state tree
    // suppress warnings just in case the user has added
    // some funky global mixins
    const silent = Vue.config.silent

    // 临时改变silent
    Vue.config.silent = true

    // 一个内置的vue实例。
    // 计算属性的方式存储了 store 的 getters
    store._vm = new Vue({
        data: {
            $$state: state
        },
        computed
    })
    Vue.config.silent = silent

    // enable strict mode for new vm
    if (store.strict) {

        // 在严格模式下，监控state变化，必须通过mutations
        enableStrictMode(store)
    }

    if (oldVm) {
        if (hot) {
            // dispatch changes in all subscribed watchers
            // to force getter re-evaluation for hot reloading.
            //  由于这个函数每次都会创建新的 Vue 实例并赋值到 store._vm 上， 那么旧的 _vm 对象的状态设置为 null， 
            store._withCommit(() => {
                oldVm._data.$$state = null
            })
        }
        // 调用 $destroy 方法销毁这个旧的 _vm 对象。
        Vue.nextTick(() => oldVm.$destroy())
    }
}

/**
 * @desc 安装module
 * @param {Object} store 
 * @param {Object} rootState 
 * @param {Array} path 
 * @param {Object} module 
 * @param {*} hot 
 */
function installModule(store, rootState, path, module, hot) {
    // 根据路径的长度来判断是否是根
    const isRoot = !path.length
        // 获取模块的命名空间。
    const namespace = store._modules.getNamespace(path)

    // register in namespace map
    if (module.namespaced) {
        // 如果开启命名空间为true， 在namespace map 上注册。
        store._modulesNamespaceMap[namespace] = module
    }

    // set state
    /// 设置级联state   
    if (!isRoot && !hot) {
        // 获取父状态
        const parentState = getNestedState(rootState, path.slice(0, -1))
        const moduleName = path[path.length - 1]
        store._withCommit(() => {
            Vue.set(parentState, moduleName, module.state)
        })
    }

    const local = module.context = makeLocalContext(store, namespace, path)

    module.forEachMutation((mutation, key) => {
        const namespacedType = namespace + key
        registerMutation(store, namespacedType, mutation, local)
    })

    module.forEachAction((action, key) => {
        const type = action.root ? key : namespace + key
        const handler = action.handler || action
        registerAction(store, type, handler, local)
    })

    module.forEachGetter((getter, key) => {
        const namespacedType = namespace + key
        registerGetter(store, namespacedType, getter, local)
    })

    module.forEachChild((child, key) => {
        installModule(store, rootState, path.concat(key), child, hot)
    })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
/**
 * 
 * @param {Object} store 
 * @param {String} namespace 
 * @param {Array} path 
 */
function makeLocalContext(store, namespace, path) {
    const noNamespace = namespace === ''

    const local = {
        dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options)
            const { payload, options } = args
            let { type } = args

            if (!options || !options.root) {
                type = namespace + type
                if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
                    console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
                    return
                }
            }

            return store.dispatch(type, payload)
        },

        commit: noNamespace ? store.commit : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options)
            const { payload, options } = args
            let { type } = args

            if (!options || !options.root) {
                type = namespace + type
                if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
                    console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
                    return
                }
            }

            store.commit(type, payload, options)
        }
    }

    // getters and state object must be gotten lazily
    // because they will be changed by vm update
    Object.defineProperties(local, {
        getters: {
            get: noNamespace ?
                () => store.getters :
                () => makeLocalGetters(store, namespace)
        },
        state: {
            get: () => getNestedState(store.state, path)
        }
    })

    return local
}

function makeLocalGetters(store, namespace) {
    const gettersProxy = {}

    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
        // skip if the target getter is not match this namespace
        if (type.slice(0, splitPos) !== namespace) return

        // extract local getter type
        const localType = type.slice(splitPos)

        // Add a port to the getters proxy.
        // Define as getter property because
        // we do not want to evaluate the getters in this time.
        Object.defineProperty(gettersProxy, localType, {
            get: () => store.getters[type],
            enumerable: true
        })
    })

    return gettersProxy
}

/**
 * @desc 接受了四个参数， 第一个是store对象， 第二个是类型， 第三个是handler , 第四个是当前模块
 * @param {Object} store 
 * @param {String} type 
 * @param {Function} handler 
 * @param {*} local 
 */
function registerMutation(store, type, handler, local) {
    // handler操作符是在mutations 里面写的，接好连个参数， 第一个是state, 第二个是payload,
    // 把mutations 修改包装，注册写到_mutations 里面。 然后在commit的时候执行， 只接受payload 
    const entry = store._mutations[type] || (store._mutations[type] = [])
    entry.push(function wrappedMutationHandler(payload) {
        handler.call(store, local.state, payload)
    })
}

/**
 * @desc 接受了四个参数， 第一个是store对象， 第二个是类型， 第三个是handler , 第四个是当前模块
 * @param {Object} store 
 * @param {String} type 
 * @param {Function} handler 
 * @param {*} local 
 */
function registerAction(store, type, handler, local) {
    const entry = store._actions[type] || (store._actions[type] = [])
    entry.push(function wrappedActionHandler(payload, cb) {
        let res = handler.call(store, {
            dispatch: local.dispatch,
            commit: local.commit,
            getters: local.getters,
            state: local.state,
            rootGetters: store.getters,
            rootState: store.state
        }, payload, cb)
        if (!isPromise(res)) {
            //  如果不是promsie,加工成promise
            res = Promise.resolve(res)
        }

        // Vuex devtools 开启的时候，我们才能捕获 promise 的过程！
        if (store._devtoolHook) {
            // 处理里面可能存在的报错信息。
            return res.catch(err => {
                store._devtoolHook.emit('vuex:error', err)
                throw err
            })
        } else {
            return res
        }
    })
}

/**
 * @desc 注册getter, 把所有的getter封装放到_wrappedGetters里面。包装了一层。 
 *   包转的_wrappedGetters 在resetStoreVM里面执行。
 * @param {Object} store 
 * @param {String} type 
 * @param {Function} rawGetter 
 * @param {Object} local 
 */
function registerGetter(store, type, rawGetter, local) {
    if (store._wrappedGetters[type]) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[vuex] duplicate getter key: ${type}`)
        }
        return
    }
    store._wrappedGetters[type] = function wrappedGetter(store) {
        // 向外返回的是state， getters, rootState, rootgetters.
        return rawGetter(
            local.state, // local state
            local.getters, // local getters
            store.state, // root state
            store.getters // root getters
        )
    }
}
/**
 * @desc 监测 store._vm.state 的变化，看看 state 的变化是否通过执行 mutation 的回调函数改变，
 * 如果是外部直接修改 state，那么 store._committing 的值为 false，这样就抛出一条错误。
 * 再次强调一下，Vuex 中对 state 的修改只能在 mutation 的回调函数里
 * @param {Object} store 
 */
function enableStrictMode(store) {
    store._vm.$watch(function() { return this._data.$$state }, () => {
        if (process.env.NODE_ENV !== 'production') {
            assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
        }
    }, { deep: true, sync: true })
}

/**
 * @desc 根据路径 获取内层的state，如果空数组，返回state, 如果非空， 根据path进行寻找。
 * @param {Object} state 
 * @param {Array} path 
 */
function getNestedState(state, path) {
    return path.length ?
        path.reduce((state, key) => state[key], state) :
        state
}

/**
 * 
 * @param {String/Object} type 接受的类型， 如果是String, 直接返回， 如果是对象， 取出里面的type
 * @param {*} payload 
 * @param {*} options 
 * @return {type payload, options} String, * * [表示要commit的类型， 载荷]
 */

function unifyObjectStyle(type, payload, options) {
    if (isObject(type) && type.type) {
        options = payload
        payload = type
        type = type.type
    }

    if (process.env.NODE_ENV !== 'production') {
        assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
    }

    return { type, payload, options }
}

export function install(_Vue) {
    if (Vue && _Vue === Vue) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(
                '[vuex] already installed. Vue.use(Vuex) should be called only once.'
            )
        }
        return
    }
    Vue = _Vue
    applyMixin(Vue)
}
import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert } from './util'

let Vue // bind on install
export class Store {
    constructor(options = {}) {
            console.log(Store.constructor)
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
            // store 内部的状态
            this._committing = false
            this._actions = Object.create(null)
            this._actionSubscribers = []
            this._mutations = Object.create(null)
            this._wrappedGetters = Object.create(null)
            this._modules = new ModuleCollection(options)
            this._modulesNamespaceMap = Object.create(null)
            this._subscribers = []
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
        debugger
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown mutation type: ${type}`)
            }
            return
        }
        // 根据获取的mutations, 进行执行。传入payload
        this._withCommit(() => {
                // 遍历包含mutation函数的数组，然后把payload,传进去。
                entry.forEach(function commitIterator(handler) {
                    handler(payload)
                })
            })
            // 执行发布者， 把mutation和当前的state 发布出去。
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
     * @desc 插入到订阅者数组里面， 返回一个删除该函数的方法。
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

    watch(getter, cb, options) {
        if (process.env.NODE_ENV !== 'production') {
            assert(typeof getter === 'function', `store.watch only accepts a function.`)
        }
        return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
    }

    /**
     * @desc 传入的state来替代vm上的state, 进行数据变化。
     * @param {Object} state 
     */
    replaceState(state) {
        this._withCommit(() => {
            this._vm._data.$$state = state
        })
    }

    registerModule(path, rawModule, options = {}) {
        // 如果传入的路径是String, 把他转化为数组。
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
            assert(path.length > 0, 'cannot register the root module by using registerModule.')
        }

        this._modules.register(path, rawModule)
        installModule(this, this.state, path, this._modules.get(path), options.preserveState)
            // reset store to update getters...
        resetStoreVM(this, this.state)
    }

    unregisterModule(path) {
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
        }

        this._modules.unregister(path)
        this._withCommit(() => {
            const parentState = getNestedState(this.state, path.slice(0, -1))
            Vue.delete(parentState, path[path.length - 1])
        })
        resetStore(this)
    }

    hotUpdate(newOptions) {
        this._modules.update(newOptions)
        resetStore(this, true)
    }

    /**
     * @desc committing 提交， 函数执行前为true, 执行后false, 截流。 
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
    const oldVm = store._vm

    // bind store public getters
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
    Vue.config.silent = true
    store._vm = new Vue({
        data: {
            $$state: state
        },
        computed
    })
    Vue.config.silent = silent

    // enable strict mode for new vm
    if (store.strict) {
        enableStrictMode(store)
    }

    if (oldVm) {
        if (hot) {
            // dispatch changes in all subscribed watchers
            // to force getter re-evaluation for hot reloading.
            store._withCommit(() => {
                oldVm._data.$$state = null
            })
        }
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
    if (!isRoot && !hot) {
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
 * 
 * @param {Object} store 
 * @param {String} type 
 * @param {Function} handler 
 * @param {*} local 
 */
function registerMutation(store, type, handler, local) {
    const entry = store._mutations[type] || (store._mutations[type] = [])
    entry.push(function wrappedMutationHandler(payload) {
        handler.call(store, local.state, payload)
    })
}

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
            res = Promise.resolve(res)
        }
        if (store._devtoolHook) {
            return res.catch(err => {
                store._devtoolHook.emit('vuex:error', err)
                throw err
            })
        } else {
            return res
        }
    })
}

function registerGetter(store, type, rawGetter, local) {
    if (store._wrappedGetters[type]) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[vuex] duplicate getter key: ${type}`)
        }
        return
    }
    store._wrappedGetters[type] = function wrappedGetter(store) {
        return rawGetter(
            local.state, // local state
            local.getters, // local getters
            store.state, // root state
            store.getters // root getters
        )
    }
}

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
/**
 * @desc 向外提供一个实例
 * @method get  根据路径获取模块
 * @method getNamespace 根据路径获取命名空间
 * @method update 更新模块。
 * @method register 注册一个模块
 * @attr root 自己本身的模块
 * @method unregister 注销模块
 */
import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
    // 接好的是 root modules。
    constructor(rawRootModule) {
        // register root module (Vuex.Store options)
        this.register([], rawRootModule, false)
    }

    /**
     * @desc 根据路径获取模块， 默认是从根模块出发。
     * @param {Array} path 
     */
    get(path) {
        return path.reduce((module, key) => {
            return module.getChild(key)
        }, this.root)
    }

    /**
     * 
     * @param {Array} path 根据模块路径名字获取命名空间。 
     */
    getNamespace(path) {
        let module = this.root
        return path.reduce((namespace, key) => {
            module = module.getChild(key)
            return namespace + (module.namespaced ? key + '/' : '')
        }, '')
    }

    /**
     * @desc 更新根模块。
     * @param {Object} rawRootModule 模块
     */
    update(rawRootModule) {
        update([], this.root, rawRootModule)
    }

    /**
     * @desc 注册一个模块
     * @param {Array} path  模块所在路径， 最高模块是root
     * @param {Object} rawModule  需要注册的模块
     * @param {Boolean} runtime 运行时间
     */
    register(path, rawModule, runtime = true) {
        if (process.env.NODE_ENV !== 'production') {
            assertRawModule(path, rawModule)
        }

        // 初始化模块实例。
        const newModule = new Module(rawModule, runtime)

        // path的路径为空， 说明是最高模块。
        if (path.length === 0) {
            this.root = newModule
        } else {
            // 获取父模块。
            const parent = this.get(path.slice(0, -1))

            // 当前模块作为父模块的子模块注入进去。
            parent.addChild(path[path.length - 1], newModule)
        }

        // register nested modules
        // 注册内层的模块。
        if (rawModule.modules) {
            // 遍历所有的modules,并且进行注册在相应的路径上。
            forEachValue(rawModule.modules, (rawChildModule, key) => {
                this.register(path.concat(key), rawChildModule, runtime)
            })
        }
    }

    unregister(path) {
        const parent = this.get(path.slice(0, -1))
        const key = path[path.length - 1]
        if (!parent.getChild(key).runtime) return

        parent.removeChild(key)
    }
}

/**
 * @desc 更新模块。
 * @param {Array} path  
 * @param {*} targetModule // 要更新的目标模块
 * @param {*} newModule  // 新模块
 */
function update(path, targetModule, newModule) {
    if (process.env.NODE_ENV !== 'production') {
        assertRawModule(path, newModule)
    }

    // update target module
    // 更新目标模块。
    targetModule.update(newModule)

    // update nested modules
    // 更新内层模块。

    if (newModule.modules) {
        for (const key in newModule.modules) {
            // 循环当前模块，递归更新当前模块的子模块。
            if (!targetModule.getChild(key)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(
                        `[vuex] trying to add a new module '${key}' on hot reloading, ` +
                        'manual reload is needed'
                    )
                }
                return
            }
            update(
                path.concat(key),
                targetModule.getChild(key),
                newModule.modules[key]
            )
        }
    }
}

// 定义函数断言的对象。
const functionAssert = {
    assert: value => typeof value === 'function',
    expected: 'function'
}

// 定义函数和对象的断言。 要么是个函数，要么是个 对象，对象必要有个handler函数
const objectAssert = {
    assert: value => typeof value === 'function' ||
        (typeof value === 'object' && typeof value.handler === 'function'),
    expected: 'function or object with "handler" function'
}

// 断言的类型。
const assertTypes = {
    getters: functionAssert,
    mutations: functionAssert,
    actions: objectAssert
}

/**
 * @desc 对当前模块的getters, mutations, actions 进行断言。
 * @param {Array} 模块的路径 
 * @param {Object} rawModule 模块
 */
function assertRawModule(path, rawModule) {
    Object.keys(assertTypes).forEach(key => {
        if (!rawModule[key]) return

        // 获取断言规则。
        const assertOptions = assertTypes[key]

        // 遍历该类型下的所有方法或者对象。
        forEachValue(rawModule[key], (value, type) => {
            // 进行断言
            assert(
                assertOptions.assert(value),
                makeAssertionMessage(path, key, type, value, assertOptions.expected)
            )
        })
    })
}

/**
 * 
 * @param {Array} path 路径
 * @param {*} key modules的key值。
 * @param {*} type  modules key值对应的对象的type/key
 * @param {*} value modules key值对应的对象的某个value
 * @param {*} expected 对于该value所期待的类型
 */
function makeAssertionMessage(path, key, type, value, expected) {
    let buf = `${key} should be ${expected} but "${key}.${type}"`
    if (path.length > 0) {
        buf += ` in module "${path.join('.')}"`
    }
    buf += ` is ${JSON.stringify(value)}.`
    return buf
}
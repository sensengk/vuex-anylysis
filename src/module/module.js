/**
 * @desc 模块类
 * @attr _children, 存放子模块
 * @attr _rawModule 模块
 * @attr state state
 * @attr namespaced 明明空间是否开启。 
 * @method addChild 添加子模块
 * @method removeChild 删除子模块
 * @method getChild 获取子模块
 * @method update 更新子模块
 * @method forEachChild 遍历子模块
 * @method forEachGetter 遍历getters
 * @method forEachMutation 遍历mutation
 * @method forEachAction 遍历action
 */
import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
export default class Module {
    constructor(rawModule, runtime) {
            // 运行时间。 暂时不知道用途。
            this.runtime = runtime

            // Store some children item
            // 在该module下定义_children, 来存放子模块。
            this._children = Object.create(null)
                // Store the origin module object which passed by programmer
            this._rawModule = rawModule
            const rawState = rawModule.state

            // Store the origin module's state
            // 初始化module的state.
            this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
        }
        /**
         * es6 class的取值函数， 通过实例，调用namespaced.
         */
    get namespaced() {
        // 双！， 把一个值转化为boolean
        return !!this._rawModule.namespaced
    }

    /**
     * @desc 添加子模块。
     * @param {String} key 子模块key
     * @param {Object} module  子模块
     */
    addChild(key, module) {
        this._children[key] = module
    }

    /**
     * @desc 根据key值，删除子模块。
     * @param {String} key 
     */
    removeChild(key) {
        delete this._children[key]
    }

    /**
     * 
     * @param {String} key 返回某个子模块。
     */
    getChild(key) {
        return this._children[key]
    }

    /**
     * @desc 更新某个子模块 可以跟新某个子模块的 namespaced 是否开启命名空间 actions mutations getters.
     * @param {Object} rawModule 
     */
    update(rawModule) {
        this._rawModule.namespaced = rawModule.namespaced
        if (rawModule.actions) {
            this._rawModule.actions = rawModule.actions
        }
        if (rawModule.mutations) {
            this._rawModule.mutations = rawModule.mutations
        }
        if (rawModule.getters) {
            this._rawModule.getters = rawModule.getters
        }
    }

    /**
     * @desc 循环遍历处理 当前模块下的子模块。 
     * @param {Function} fn 
     */
    forEachChild(fn) {
        forEachValue(this._children, fn)
    }

    /**
     * @desc 循环处理getters
     * @param {Function} fn 
     */
    forEachGetter(fn) {
        if (this._rawModule.getters) {
            forEachValue(this._rawModule.getters, fn)
        }
    }

    /**
     * 循环处理actions
     * @param {Function} fn 
     */
    forEachAction(fn) {
        if (this._rawModule.actions) {
            forEachValue(this._rawModule.actions, fn)
        }
    }

    /**
     * @desc 循环处理mutation
     * @param {Function} fn 
     */
    forEachMutation(fn) {
        if (this._rawModule.mutations) {
            forEachValue(this._rawModule.mutations, fn)
        }
    }
}
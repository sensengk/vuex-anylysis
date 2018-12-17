export default function(Vue) {
    const version = Number(Vue.version.split('.')[0])

    // 获取vue的版本， 如果大于等于2的时候, 使用vue.mixin方法，
    // 在执行到钩子函数beforeCreate时，执行vuex的初始化。
    if (version >= 2) {
        Vue.mixin({ beforeCreate: vuexInit })
    } else {
        // override init and inject vuex init procedure
        // for 1.x backwards compatibility.
        // 重新覆盖init, 把vuex 程序注入 init. 对于1.x版本的兼容。
        const _init = Vue.prototype._init
        Vue.prototype._init = function(options = {}) {
            options.init = options.init ? [vuexInit].concat(options.init) :
                vuexInit
            _init.call(this, options)
        }
    }

    /**
     * Vuex init hook, injected into each instances init hooks list.
     */

    /**
     * vuex初始化钩子函数。 租入每一个实例上，然后执行。
     */
    function vuexInit() {
        const options = this.$options
            // store injection
        if (options.store) {
            this.$store = typeof options.store === 'function' ?
                options.store() :
                options.store
        } else if (options.parent && options.parent.$store) {
            this.$store = options.parent.$store
        }
    }
}
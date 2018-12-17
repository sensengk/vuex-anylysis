/**
 * Get the first item that pass the test
 * by second argument function
 * @desc {string} 通过第二个参数，进行筛选，获取第一个参数。
 * @param {Array} list 
 * @param {Function} f
 * @return {*}
 */
export function find(list, f) {
    return list.filter(f)[0]
}

/**
 * Deep copy the given object considering circular structure.
 * This function caches all nested objects and its copies.
 * If it detects circular structure, use cached copy to avoid infinite loop.
 * @param {*} obj
 * @param {Array<Object>} cache
 * @return {*}
 */
export function deepCopy(obj, cache = []) {
    // just return if obj is immutable value
    // 如果是基本类型值，直接返回
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    // if obj is hit, it is in circular structure
    // 通过仓库里面的original , 来判断当前需要克隆的对象是否在循环引用中。如果是的话，直接放回它的copy.
    const hit = find(cache, c => c.original === obj)
    if (hit) {
        return hit.copy
    }

    const copy = Array.isArray(obj) ? [] : {}
        // put the copy into cache at first
        // because we want to refer it in recursive deepCopy
        // 首先需要把引用类型值放到cache里面， 我们需要知道它是否在一个循环引用里面
    cache.push({
            original: obj,
            copy
        })
        // 遍历数组和对象进行深克隆，继续递归。 
        // 如果obj是数组， object.keys(obj)得到的是按照长度，下表排列的数组。
    Object.keys(obj).forEach(key => {
        copy[key] = deepCopy(obj[key], cache)
    })

    return copy
}

/**
 * forEach for object to deal the function
 */
/**
 * @desc 使用第二个参数fn, 循环遍历处理对象， 把对象的value， key传入function
 * @param {obj} obj 
 * @param {fn} fn 
 */
export function forEachValue(obj, fn) {
    Object.keys(obj).forEach(key => fn(obj[key], key))
}
/**
 * 
 * @param {*} obj 
 * @return {Boolean} 返回是否是一个对象
 */
export function isObject(obj) {
    return obj !== null && typeof obj === 'object'
}

/**
 * 
 * @param {val} val promise
 * @return {Boolean} 是否是promise
 */
export function isPromise(val) {
    return val && typeof val.then === 'function'
}
/**
 * 
 * @param {Boolean} condition  条件
 * @param {*} msg 抛出异常
 */
export function assert(condition, msg) {
    if (!condition) throw new Error(`[vuex] ${msg}`)
}
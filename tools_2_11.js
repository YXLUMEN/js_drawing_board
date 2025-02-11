export const TOOLS = Object.assign(Object.create(null), {
    BRUSH: 'brush',
    ERASER: 'eraser',
    COLOR_PICKER: 'color-picker',
    FILL: 'fill',
    LINE: 'line',
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle'
});
Object.preventExtensions(TOOLS);

// 只需要开始及结束点的方法,如几何元素
export const GEOMETRY_TOOLS = new Set([
    TOOLS.LINE, TOOLS.RECTANGLE, TOOLS.CIRCLE,
]);

// 储存只需要一个点的方法(需要手动调用saveState )
export const ONLY_ONE_POINT = new Set([
    TOOLS.COLOR_PICKER, TOOLS.FILL,
]);
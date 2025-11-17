// === Функция заливки ===
function fillTerrain(grid) {
  const width = grid.length;       // Z
  const length = grid[0].length;   // X

  function addFilled(cell, elev) {
    cell.elev = newElev
  }

  // Определение, на какой высоте производить заливку - 
  // на высоте равной опорной точке (возвышение/ровный рельеф) или на 1 ниже (спуск рельефа)
  function decideFill(leftHeights, rightHeights) {
    if (!leftHeights || !rightHeights) return null;
    if (leftHeights.length === 0 || rightHeights.length === 0) return null;

    const allHeights = leftHeights.concat(rightHeights)

    return Math.min(...allHeights);
  }

  // === SCANLINE ===
  function scanlineFill(dir) {
    const outerMax = dir === 'x' ? width : length;
    const innerMax = dir === 'x' ? length : width;

    for (let outer = 0; outer < outerMax; outer++) {
      let leftAnchor = null;
      let buffer = [];

      for (let inner = 0; inner < innerMax; inner++) {

        const cell =
          dir === 'x' ? grid[outer][inner] : grid[inner][outer];
        const cHeights = cell.elev;

        if (cHeights.length > 0) {   // Если столкнулись с ячейкой, на которой определен контур
          
          if (leftAnchor === null) { // Если опорной точки нет: Делаем эту точку опорной и начинаем запись buffer
            leftAnchor = { pos: inner, heights: cHeights };
            buffer = [];
          } else {                   // Если опорная точка есть: Начинаем заполнение ячеек между опорной точкой и нынешней
            const leftHeights = leftAnchor.heights // Массив высот левой точки (опорной)
            const rightHeights = cHeights          // Массив высот правой точки (на которой мы сейчас)

            // Определение, на какой высоте заполнять ячейки
            const fillTarget = decideFill(leftHeights, rightHeights);

            if (fillTarget !== null) {
              // Заполнение каждой ячейки в buffer
              for (const mid of buffer) {
                const cellToFill =
                  dir === 'x' ? grid[outer][mid] : grid[mid][outer];
                cellToFill.elev.push(fillTarget);
                cellToFill.type = 'filled';
              }
            }
            // И опорная ячейка переписывается на текущую ячейку
            leftAnchor = { pos: inner, heights: cHeights };
            buffer = [];
          }
        } else {
          // Добавление ячейки в буфер
          if (leftAnchor !== null) buffer.push(inner);
        }
      }
    }
  }

  // два прохода — по X и по Z
  scanlineFill('z'); // X-pass
  scanlineFill('x'); // Z-pass
}

module.exports = fillTerrain;
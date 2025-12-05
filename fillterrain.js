// === Функция заливки ===
function fillTerrain(grid) {
  const width = grid.length;       // Z
  const length = grid[0].length;   // X

  // Определение, производить ли заливку и на какой высоте
  function decideFill(leftHeights, rightHeights) {
    if (!leftHeights || !rightHeights) return null;
    if (leftHeights.length === 0 || rightHeights.length === 0) return null;

    const setR = new Set(rightHeights);
    // Проверка, что число совпадает, +1 или -1
    for (const h of leftHeights) {
      if (
        setR.has(h) ||
        setR.has(h-1) ||
        setR.has(h+1)
      ) {
        const minHeight = Math.min(
          ...leftHeights,
          ...rightHeights
        );
        return minHeight
      }
    }

    return null;
  }

  // === SCANLINE ===
  function scanlineFill(dir) {
    // x; z; -x; -z
    const isX = dir.includes('x');
    const reverse = dir.startsWith('-');

    const outerMax = isX ? width : length;
    const innerMax = isX ? length : width;

    const outerStart = reverse ? outerMax - 1 : 0;
    const outerEnd   = reverse ? -1 : outerMax;
    const outerStep  = reverse ? -1 : 1;

    const innerStart = reverse ? innerMax - 1 : 0;
    const innerEnd   = reverse ? -1 : innerMax;
    const innerStep  = reverse ? -1 : 1;

    for (let outer = outerStart; outer !== outerEnd; outer += outerStep) {
      let leftAnchor = null;
      let buffer = [];

      for (let inner = innerStart; inner !== innerEnd; inner += innerStep) {

        const cell = isX ? grid[outer][inner] : grid[inner][outer];
        let cHeights = cell.elev;

        if (cHeights.length > 0) {
          
          if (leftAnchor === null) { // Если опорной точки нет: Делаем эту точку опорной и начинаем запись buffer
            leftAnchor = {
              pos: inner, 
              heights: cHeights 
            };
            buffer = [];

          } else {                   // Если опорная точка есть: Начинаем заполнение ячеек между опорной точкой и нынешней
            const leftHeights = leftAnchor.heights // Массив высот левой точки (опорной)
            const rightHeights = cHeights          // Массив высот правой точки (на которой мы сейчас)

            // Определение, на какой высоте заполнять ячейки
            const fillTarget = decideFill(leftHeights, rightHeights);

            if (fillTarget !== null) {
              // Заполнение каждой ячейки в buffer
              for (const mid of buffer) {
                const cellToFill = isX ? grid[outer][mid] : grid[mid][outer];
                cellToFill.elev.push(fillTarget);
                cellToFill.type = 'filled';
              }

              // Если правая точка - изумруд, то она не должна быть выше левой точки ни при каких обстоятельствах
              if (cell.type === 'filled') {
                cell.elev = [fillTarget]
                cHeights = [fillTarget]
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
  scanlineFill('x'); // Z-pass для того чтобы спустись поднятые изумруды и закрыть дыры
  scanlineFill('-x'); // тот же Z-pass для спуска поднятых изюмов, но в обратном направлении
}

module.exports = fillTerrain;
// Признаюсь, весь код в этом файле написан chatgpt, 
// так что я понятия не имею, что за что отвечает

function getLineLength(line) {
    let length = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const dx = line[i+1][0] - line[i][0];
      const dy = line[i+1][1] - line[i][1];
      length += Math.hypot(dx, dy);
    }
    return length;
  }

  function resampleLine(line, targetPoints = 50) {
    const totalLength = getLineLength(line);
    const segmentLength = totalLength / (targetPoints - 1);

    const newLine = [line[0]];
    let accumulated = 0;

    for (let i = 1; i < line.length; i++) {
      let [x1, y1] = line[i - 1];
      let [x2, y2] = line[i];

      let dx = x2 - x1;
      let dy = y2 - y1;
      let dist = Math.hypot(dx, dy);

      while (accumulated + dist >= segmentLength) {
        const t = (segmentLength - accumulated) / dist;
        x1 += dx * t;
        y1 += dy * t;

        newLine.push([x1, y1]);

        dx = x2 - x1;
        dy = y2 - y1;
        dist = Math.hypot(dx, dy);

        accumulated = 0;
      }

      accumulated += dist;
    }

    if (newLine.length < targetPoints) {
      newLine.push(line[line.length - 1]);
    }

    return newLine;
  }

  function interpolateLines(lineA, lineB, steps) {
    const result = [];

    let a = resampleLine(lineA);
    let b = resampleLine(lineB);

    [a, b] = ensureSameDirection(a, b);
    b = alignStartPoints(a, b);

    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const newLine = [];

      for (let i = 0; i < a.length; i++) {
        const x = a[i][0] + (b[i][0] - a[i][0]) * t;
        const y = a[i][1] + (b[i][1] - a[i][1]) * t;
        newLine.push([x, y]);
      }

      result.push(newLine);
    }

    return result;
  }

  function alignStartPoints(lineA, lineB) {
    let bestOffset = 0;
    let bestScore = Infinity;

    for (let offset = 0; offset < lineB.length; offset++) {
      let score = 0;

      for (let i = 0; i < lineA.length; i++) {
        const a = lineA[i];
        const b = lineB[(i + offset) % lineB.length];

        const dx = a[0] - b[0];
        const dy = a[1] - b[1];

        score += dx * dx + dy * dy;
      }

      if (score < bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }

    const aligned = [];
    for (let i = 0; i < lineB.length; i++) {
      aligned.push(lineB[(i + bestOffset) % lineB.length]);
    }

    return aligned;
  }

  function polygonArea(line) {
    let area = 0;
    for (let i = 0; i < line.length; i++) {
      const [x1, y1] = line[i];
      const [x2, y2] = line[(i + 1) % line.length];
      area += (x1 * y2 - x2 * y1);
    }
    return area / 2;
  }

  function ensureSameDirection(lineA, lineB) {
    const dirA = Math.sign(polygonArea(lineA));
    const dirB = Math.sign(polygonArea(lineB));

    if (dirA !== dirB) {
      return [lineA, [...lineB].reverse()];
    }

    return [lineA, lineB];
  }

  function getCentroid(line) {
    let x = 0, y = 0;
    for (const [px, py] of line) {
      x += px;
      y += py;
    }
    return [x / line.length, y / line.length];
  }

  function matchLines(linesA, linesB) {
    const result = [];

    const centersA = linesA.map(getCentroid);
    const centersB = linesB.map(getCentroid);

    const used = new Set();

    for (let i = 0; i < linesA.length; i++) {
      let best = -1;
      let bestDist = Infinity;

      for (let j = 0; j < linesB.length; j++) {
        if (used.has(j)) continue;

        const dx = centersA[i][0] - centersB[j][0];
        const dy = centersA[i][1] - centersB[j][1];
        const dist = dx*dx + dy*dy;

        if (dist < bestDist) {
          bestDist = dist;
          best = j;
        }
      }

      if (best !== -1) {
        used.add(best);
        result.push([linesA[i], linesB[best]]);
      }
    }

    return result;
  }

  function interpolateContours(contours, step = 1) {
    const heights = Object.keys(contours)
      .map(Number)
      .sort((a, b) => a - b);

    const result = {};

    for (let i = 0; i < heights.length - 1; i++) {
      const h1 = heights[i];
      const h2 = heights[i + 1];

      let lines1 = contours[h1] || [];
      let lines2 = contours[h2] || [];

      // сохраняем исходный уровень
      result[h1] = lines1;

      const delta = h2 - h1;
      const steps = Math.floor(delta / step);

      if (steps <= 1) continue;

      // сопоставляем линии
      const pairs = matchLines(lines1, lines2);

      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const newHeight = h1 + s * step;

        if (!result[newHeight]) result[newHeight] = [];

        for (const [lineA, lineB] of pairs) {
          if (!lineA || !lineB) continue;

          // ресемплинг
          let a = resampleLine(lineA, 50);
          let b = resampleLine(lineB, 50);

          // выравнивание направления
          [a, b] = ensureSameDirection(a, b);

          // выравнивание стартовой точки
          b = alignStartPoints(a, b);

          // интерполяция
          const newLine = [];

          for (let i = 0; i < a.length; i++) {
            const x = a[i][0] + (b[i][0] - a[i][0]) * t;
            const y = a[i][1] + (b[i][1] - a[i][1]) * t;
            newLine.push([x, y]);
          }

          result[newHeight].push(newLine);
        }
      }
    }

    // добавляем последний уровень
    const lastHeight = heights[heights.length - 1];
    result[lastHeight] = contours[lastHeight];

    return result;
  }

  module.exports = interpolateContours;
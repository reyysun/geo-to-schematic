/*
  The logic begind creating a schematic from an array of coordinates
  was taken from TerraSketch (https://github.com/Codestian/TerraSketch)
  and modified to support heights.
  I appreciate Codestian's work behind this code and recommend you
  to use TerraSketch, it's really great for outlining!
*/

const terraconvert = require('@bte-germany/terraconvert');
const nbt = require('prismarine-nbt')
const fflate = require('fflate')
const Schematic = require('./schematicformats')
const fillTerrain = require('./fillterrain.js')


function convertGeoData(geolist, blockId, offset, schemVersion, consElev, doFill, fillBlockId) {

  // Преобразование координат в проекцию BTE и округление
  function getBTECoords(contours, consElev) {
      const btecoords = {};
      let mcheight;

      for (const [elev, lines] of Object.entries(contours)) {
        
        if (consElev) { mcheight = elev - 1 }
        else { mcheight = 0 }

        lines.forEach(line => {
            const convertedLine = []

            line.forEach(coord => {
                convertedLine.push(
                  terraconvert.fromGeo(coord[1],coord[0]) // Конвертация координат в проекцию BTE
                  .map(n => Math.floor(n))   // Округление вниз до целого числа
                )
            })
            
            // Добавляем сконвертированное в словарь btecoords
            if (!btecoords[mcheight]) {btecoords[mcheight] = []};
            btecoords[mcheight].push(convertedLine);
        })

      }
      return btecoords
  }

  function createSchematic(btecoords, blockId, offset, schemVersion, doFill, fillBlockId) {

    const allCoords = Object.entries(btecoords).flatMap(([elev, lines]) =>
      (lines || []).flatMap(line => (line || []).map(([x, z]) => [x, z, Number(elev)]))
    );

    if (allCoords.length === 0) {
      throw new Error("No coordinates in btecoords");
    }

    const xCoords = allCoords.map(([x]) => x);
    const zCoords = allCoords.map(([_, z]) => z);
    const yCoords = allCoords.map(([_, __, y]) => y);

    const minX = xCoords.reduce((min, val) => Math.min(min, val), Infinity);
    const maxX = xCoords.reduce((max, val) => Math.max(max, val), -Infinity);
    const minZ = zCoords.reduce((min, val) => Math.min(min, val), Infinity);
    const maxZ = zCoords.reduce((max, val) => Math.max(max, val), -Infinity);
    const minY = yCoords.reduce((min, val) => Math.min(min, val), Infinity);
    const maxY = yCoords.reduce((max, val) => Math.max(max, val), -Infinity);

    const length = maxX - minX + 1; // size X
    const width  = maxZ - minZ + 1; // size Z
    const height = maxY - minY + 1; // size Y

    const totalSize = width * height * length;
    if (width > 32767 || length > 32767 || height > 2000 || totalSize > 5_000_000_000) {
      throw new Error("Schematic too big");
    }

    // 2D grid [z][x]
    const grid = Array.from({ length: width }, () =>
      Array.from({ length }, () => ({"elev": new Array, "type": null}))
    );

    // Функция добавления клетки контура в 2d grid
    function addEntry(cell, elev, type) {
        cell.elev = [elev];
        cell.type = type;
    }

    const toGrid = (pt) => [Math.round(pt[0]) - minX, Math.round(pt[1]) - minZ];

    // Растеризация контуров
    for (const [elevStr, lines] of Object.entries(btecoords)) {
      const elev = Number(elevStr);
      if (!lines) continue;
      for (const line of lines) {
        if (!line || line.length === 0) continue;
        if (line.length === 1) {
          const [gx, gz] = toGrid(line[0]);
          if (gx < 0 || gz < 0 || gx >= length || gz >= width) continue;
          addEntry(grid[gz][gx], elev, 'contour');
          continue;
        }
        for (let i = 0; i < line.length - 1; i++) {
          const [ax, az] = toGrid(line[i]);
          const [bx, bz] = toGrid(line[i + 1]);
          const pts = bresenham2D(ax, az, bx, bz);
          for (const [gx, gz] of pts) {
            if (gx < 0 || gz < 0 || gx >= length || gz >= width) continue;
            addEntry(grid[gz][gx], elev, 'contour');
          }
        }
      }
    }

    // Заливка (если включено)
    if (doFill) fillTerrain(grid);

    // Преобразование 2d сетки в uint8array, который пойдет в схематику
    const blockData = new Uint8Array(totalSize);
    const minecraftid = "minecraft:"
    const contourBlockId = minecraftid + (blockId ? blockId : "diamond_block");
    const fullFillBlockId = minecraftid + (fillBlockId ? fillBlockId : "emerald_block");
    const blockPalette = {
      "minecraft:air": { type: 'int', value: 0 },
      [contourBlockId]: { type: 'int', value: 1 },
      ...(doFill && { [fullFillBlockId]: { type: 'int', value: 2 } }),
    };

    for (let gz = 0; gz < width; gz++) {
      for (let gx = 0; gx < length; gx++) {
        const cell = grid[gz][gx];
        if (!cell.type) continue;

        const y = cell.elev - minY;
        if (y < 0 || y >= height) continue;
        const index = y * width * length + gz * length + gx;
        const val = (cell.type === 'contour') ? 1 : 2;
        if (blockData[index] === 0 || val === 1) blockData[index] = val;
      }
    }

    // Сборка схемы
    const originPoint = [
      Math.ceil(minX) + offset[0], 
      Math.ceil(minY) + offset[1], 
      Math.ceil(minZ) + offset[2]
    ];
    const size = { length, height, width };
    const schem = new Schematic(size, blockPalette, blockData, originPoint);

    let nbtSchematic;
    switch (schemVersion) {
      case "SpongeV3": nbtSchematic = schem.SpongeV3(); break;
      case "Legacy": nbtSchematic = schem.Legacy(); break;
      default: throw new Error("Unknown schematic version");
    }

    return [nbtSchematic, originPoint];
  }

  // Алгоритм Брезенхама
  // Возвращает массив точек, образующих прямой отрезок между 2 точками
  function bresenham2D(x1,z1,x2,z2) {

      const points = [];

      let x = x1;
      let z = z1;

      const dx = Math.abs(x2 - x1);
      const dz = Math.abs(z2 - z1);

      const sx = x1 < x2 ? 1 : -1;
      const sz = z1 < z2 ? 1 : -1;

      let err = dx - dz;

      while (true) {
          points.push([x, z]);

          if (x === x2 && z === z2) break;

          const e2 = 2 * err;

          if (e2 > -dz) {
              err -= dz;
              x += sx;
          }

          if (e2 < dx) {
              err += dx;
              z += sz;
          }
      }

      return points;
  }

  // This is where it all begins...
  
  if (schemVersion === 'Legacy' && doFill) 
    // извините я хз как это починить пока что
    { throw new Error("temporary cant do legacy with fill"); }
  const filesList = [];
  let originPoint;

  for (const [geotext, filename] of geolist) {

    const contours = getBTECoords(geotext, consElev);
    const schematicResult = createSchematic(contours, blockId, offset, schemVersion, doFill, fillBlockId);
    const schematic = schematicResult[0];
    originPoint = schematicResult[1];

    console.log('NBT done, now compressing...');
    const nbtBuffer = nbt.writeUncompressed(schematic);
    const compressed = fflate.gzipSync(nbtBuffer);
    filesList.push([compressed, filename, originPoint]);

  }

  // АРХИВАЦИЯ ZIP
  if (filesList.length > 1) { 

    console.log('More than 1 files, starting archiving...');

    let ext;
    switch (schemVersion) {
      case "SpongeV3": ext = '.schem'; break;
      case "Legacy": ext = '.schematic'; break;
    }
    
    const zipData = {};
    for (const [content, filename] of filesList) {
      zipData[filename+ext] = content;
    }
    const zipped = fflate.zipSync(zipData);
    console.log('ZIP created succesfully');
    return [zipped, true, 'geotoschematic']

  } 
  
  // ОДИН ФАЙЛ СХЕМАТИКИ
  else if (filesList.length == 1) { // 1 файл в filesList

    return [filesList[0][0], false, filesList[0][1]]

  } else {
    throw new Error("No data to process");
  }
}

window.convertGeoData = convertGeoData;

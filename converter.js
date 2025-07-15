const terraconvert = require('@bte-germany/terraconvert');
const nbt = require('prismarine-nbt')
const zlib = require('zlib')



function convertGeoData(geotext, fileType, blockId, doConnections) {

  // Чтение и парсинг файла KML
  /* Вид возвращаемого словаря (ключ - высота, значение - массив линий):
    {1: [ 
          [ [lon,lat], [lon,lat], [lon,lat]... ]
          [ [lon,lat], [lon,lat], [lon,lat]... ]
          ...
        ]
    2: ...
    }
  */
  function KMLParse(data) {
    const xml = new DOMParser().parseFromString(data, "text/xml");

    const contours = {};

    const placemarks = [...xml.getElementsByTagName("Placemark")];

    for (const placemark of placemarks) {
        const elevationData = getElevationFromExtendedData(placemark);

        let geometries = [];

        const lineString = placemark.getElementsByTagName("LineString");
        for (const line of lineString) {
            geometries.push({ type: "LineString", element: line });
        }

        const polygons = placemark.getElementsByTagName("Polygon");
        for (const poly of polygons) {
            geometries.push({ type: "Polygon", element: poly });
        }

        const multiGeometry = placemark.getElementsByTagName("MultiGeometry");
        if (multiGeometry.length > 0) {
            const multi = multiGeometry[0];

            const multiLines = multi.getElementsByTagName("LineString");
            for (const line of multiLines) {
                geometries.push({ type: "LineString", element: line });
            }

            const multiPolys = multi.getElementsByTagName("Polygon");
            for (const poly of multiPolys) {
                geometries.push({ type: "Polygon", element: poly });
            }
        }

        for (const { type, element } of geometries) {
            let geometriesCoords = [];

            if (type === "LineString") {
                const coordsText = element.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (coordsText) geometriesCoords.push(coordsText);
            }

            if (type === "Polygon") {
                const outer = element.getElementsByTagName("outerBoundaryIs")[0]?.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (outer) geometriesCoords.push(outer);

                const innerBoundaries = element.getElementsByTagName("innerBoundaryIs");
                for (const inner of innerBoundaries) {
                    const innerCoords = inner.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                    if (innerCoords) geometriesCoords.push(innerCoords);
                }
            }

            for (const coords of geometriesCoords) {
                const points = coords
                    .split(/\s+/)
                    .map(coord => coord.split(',').map(Number));

                const elevation = defineElevation(elevationData, points[0], contours);
                const linePoints = removeThirdParameter(points);
                contours[elevation].push(linePoints);
            }
        }
    }

    return contours;
  }

  // То же самое для Geojson
  function GeojsonParse(data) {

    const file = JSON.parse(data);
    const contours = {};
    const features = file.features;

    // Обрабатываем каждую фигуру в features
    for (const feature of features) {

        const featureCoordinates = feature.geometry.coordinates;
        if (!featureCoordinates) continue;

        let firstPoint = featureCoordinates[0];
        let isPoly = false;
        const featureType = feature.geometry.type;
        if (featureType == 'Polygon') {
            isPoly = true;
            firstPoint = featureCoordinates[0][0]
        }

        // Получение высоты в properties (для geojson созданных в qgis)
        const elevationData = feature.properties.ELEV;
        const elevation = defineElevation(elevationData, firstPoint, contours)

        // ПОЛИГОН
        if (isPoly) {
            const lines = featureCoordinates.map(      // Оставляем в списке координат точек линии всё кроме высоты
                line => removeThirdParameter(line));

            for (let i = 0; i < lines.length; i++) {
                contours[elevation].push(lines[i])     // Перебираем каждый полигон и пушим его в словарь
            }
        }

        // ЛИНИЯ
        else {
            const line = removeThirdParameter(featureCoordinates);
            contours[elevation].push(line);
        }
    }
    return contours
  }

  function getElevationFromExtendedData(placemark) {
      const simpleData = placemark.getElementsByTagName("SimpleData");
      for (const data of simpleData) {
          if (data.getAttribute("name") === "ELEV") {
              return data.textContent;
          }
      }
      return undefined;
  }

  function defineElevation(elevationData, firstPoint, contours) {
      const elevation = elevationData !== undefined
              ? Number(elevationData)               // Если был найден ELEV, то преобразуем его в число
              : (Math.round(firstPoint[2] ?? 0));   // если нет ELEV — берем высоту из третьего числа координат
      if (!contours[elevation]) {contours[elevation] = []}; // Заодно создаем ключ высоты в contours, если такой высоты еще нет
      return elevation
  }

  // Функция, оставляющая только широту и долготу и убирающая третий параметр (высоту), если он есть
  function removeThirdParameter(linePoints) {
      return linePoints.map(p => [p[0], p[1]])  
  }

  // Преобразование координат в проекцию BTE и округление
  function getBTECoords(contours) {
      const btecoords = {};
      let mcheight;

      for (const [elev, lines] of Object.entries(contours)) {

        mcheight = elev - 1 
        // Контур в майне будет на 1 уровень ниже,
        // чтобы в F3 отображалась нужная высота, когда стоишь на нем

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
            btecoords[mcheight].push(convertedLine)
        })

      }
      return btecoords
  }


  // Создание схематики
  function createSchematic(btecoords, blockId, doConnections) {
      const MAX_ALLOWED_SIZE = 500_000_000;

      // Получаем все координаты
      const allCoords = Object.entries(btecoords).flatMap(([elev, lines]) =>
        lines.flatMap(line => line.map(([x, z]) => [x, z, Number(elev)]))
      );

      const xCoords = allCoords.map(([x]) => x);
      const zCoords = allCoords.map(([_, z]) => z);
      const yCoords = allCoords.map(([_, __, y]) => y);

      // Границы схемы
      const minX = xCoords.reduce((min, val) => Math.min(min, val), Infinity);
      const maxX = xCoords.reduce((max, val) => Math.max(max, val), -Infinity);
      const minZ = zCoords.reduce((min, val) => Math.min(min, val), Infinity);
      const maxZ = zCoords.reduce((max, val) => Math.max(max, val), -Infinity);
      const minY = yCoords.reduce((min, val) => Math.min(min, val), Infinity);
      const maxY = yCoords.reduce((max, val) => Math.max(max, val), -Infinity);

      // Размеры схемы
      const length = maxX - minX + 1;
      const width = maxZ - minZ + 1;
      const height = maxY - minY + 1;

      const totalSize = width * height * length;
      if (totalSize > MAX_ALLOWED_SIZE) {
        throw new Error("Размер схемы слишком большой для обработки.");
      }

      const blockData = new Uint8Array(totalSize);

      const fullBlockId = "minecraft:" + blockId;
      const palette = {
        "minecraft:air": { type: nbt.TagType.Int, value: 0 },
        [fullBlockId]: { type: nbt.TagType.Int, value: 1 }
      };

      // Обработка каждой высоты
      Object.entries(btecoords).forEach(([elevStr, lines]) => {
        const y = Number(elevStr) - minY;

        lines.forEach(line => {
          const flat2D = line.map(([x, z]) => [x - minX, z - minZ]);
          let segmentPoints;
          
          // Соединения точек включены
          if (doConnections) {
            segmentPoints = [];
            for (let i = 0; i < flat2D.length - 1; i++) {
              segmentPoints.push(...bresenham2D(...flat2D[i], ...flat2D[i + 1]));
            }
          }
          // Соединения точек выключены
          else {
            segmentPoints = [];
            for (let i = 0; i < flat2D.length-1; i++) {
              segmentPoints.push(flat2D[i])
            }
          }

          segmentPoints.forEach(([x, z]) => {
            if (x < 0 || z < 0 || y < 0 || x >= length || z >= width || y >= height) return;
            const index = y * width * length + z * length + x;
            blockData[index] = 1;
          });

        });
      });

      const originPoint = [Math.ceil(minX), Math.ceil(minY), Math.ceil(minZ)]

      // Создание схематика
      const schematic = {
        type: nbt.TagType.Compound,
        name: "Schematic",
        author: "KMLtoBTESchematic",
        value: {
          DataVersion: { type: nbt.TagType.Int, value: 3700 },
          Version: { type: nbt.TagType.Int, value: 2 },
          Width: { type: nbt.TagType.Short, value: length },
          Height: { type: nbt.TagType.Short, value: height },
          Length: { type: nbt.TagType.Short, value: width },
          PaletteMax: { type: nbt.TagType.Int, value: 2 },
          Palette: { type: nbt.TagType.Compound, value: palette },
          BlockData: { type: nbt.TagType.ByteArray, value: blockData },
          BlockEntities: {
            type: nbt.TagType.List,
            value: { type: nbt.TagType.Compound, value: [] },
          },
          Entities: {
            type: nbt.TagType.List,
            value: { type: nbt.TagType.Compound, value: [] },
          },
          Metadata: { type: nbt.TagType.Compound, value: {} },
          Offset: {
            type: nbt.TagType.IntArray,
            value: originPoint,
          },
        },
      };

      return [schematic, originPoint];
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
  let parsedData

  if (fileType == 'kml') {parsedData = KMLParse(geotext)}
  else if (fileType == 'geojson') {parsedData = GeojsonParse(geotext)}

  const contours = getBTECoords(parsedData);
  const schematicResult = createSchematic(contours, blockId, doConnections);
  const schematic = schematicResult[0]; const originPoint = schematicResult[1];
  const nbtBuffer = nbt.writeUncompressed(schematic);
  const compressed = zlib.gzipSync(nbtBuffer);

  return [compressed, originPoint]
}

window.convertGeoData = convertGeoData;

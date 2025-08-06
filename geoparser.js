// KMLParse(string) - KML parsing
// GeojsonParse(string) - GeoJSON parsing
/* Data is structured as follows:

{0:                                            # Height
    [ 
        [ [lon,lat], [lon,lat], [lon,lat]... ] # Polygon (outer side)
        [ [lon,lat], [lon,lat], [lon,lat]... ] # Polygon (inner side)
        [ [lon,lat], [lon,lat], [lon,lat]... ] # LineString
        [ [lon,lat] ]                          # Point
        ...
    ]
 1: [
        [ [lon,lat], [lon,lat], [lon,lat]... ]
        [ [lon,lat], [lon,lat], [lon,lat]... ]
        ...
    ]
 2: ...
}

(Where key - height, value - array of geometric objects (Points, LineStrings and Polygons)
*/

// KML
function KMLParse(data) {
    const xml = new DOMParser().parseFromString(data, "text/xml"); 

    const elevationNames = ["elev","elevation","elevationstart"]
    const contours = {};
    let geometries = [];

    // Функция пуша геометрических элементов найденных в xml в отдельный список
    function pushGeometry(arrayIn, arrayFrom, geometryType) {
        const geometry = arrayFrom.getElementsByTagName(geometryType);
        if (geometry.length < 1) { return }

        // Определение высоты, изначально undefined
        let elevationData = undefined;
        const simpleData = arrayFrom.getElementsByTagName("SimpleData");
        // Обработка свойств элемента в SimpleData
        for (const data of simpleData) {
            const name = data.getAttribute("name").toLowerCase()
            // Если есть свойство с именем elev/elevation, то присваиваем elevationData его значение
            if (elevationNames.includes(name)) {
                elevationData = data.textContent;
                break
            }
        }
        
        // Добавляем каждый геометрический объект
        // Placemark'а или MultiGeometrии в массив geometries
        for (const element of geometry) {

            const geometryObject = 
                { type: geometryType, element: element, ELEV: elevationData }

            arrayIn.push(geometryObject)

        }
    }

    // Получение и разбор каждого placemark в документе
    const placemarks = [...xml.getElementsByTagName("Placemark")];
    for (const placemark of placemarks) {
        
        // Получение LineString
        pushGeometry(geometries, placemark, 'LineString')
        // Получение Polygon
        pushGeometry(geometries, placemark, 'Polygon')
        // Получение Point
        pushGeometry(geometries, placemark, 'Point')
        // Получение всех геометрических объектов в контейнерах MultiGeometry
        const multiGeometry = placemark.getElementsByTagName("MultiGeometry");
        if (multiGeometry.length > 0) {
            for (const multi of multiGeometry) {
            pushGeometry(geometries, multi, 'LineString');
            pushGeometry(geometries, multi, 'Polygon');
            pushGeometry(geometries, multi, 'Point');
            }
        }
        
        // Разбор каждого геометрического объекта
        for (const geometry of geometries) {

            let geometriesCoords = [];
            
            // ЛИНИЯ/ТОЧКА
            if (geometry.type === "LineString" || geometry.type === "Point") {

                const coordsText = 
                    geometry.element.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (coordsText) geometriesCoords.push(coordsText);
            }
            // ПОЛИГОН
            else if (geometry.type === "Polygon") {

                // Внешняя граница полигона (она может быть всего 1)
                const outerCoords = 
                    geometry.element.getElementsByTagName("outerBoundaryIs")[0]?.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                if (outerCoords) geometriesCoords.push(outerCoords);
                
                // Внутренние границы полигона (их может быть несколько)
                const innerBoundaries = geometry.element.getElementsByTagName("innerBoundaryIs");
                for (const inner of innerBoundaries) {
                    const innerCoords = 
                        inner.getElementsByTagName("coordinates")[0]?.textContent?.trim();
                    if (innerCoords) geometriesCoords.push(innerCoords);
                }
            }
            // Разделяем друг от друга широту, долготу и высоту
            for (const coords of geometriesCoords) {
                const points = coords
                    .split(/\s+/)
                    .map(coord => coord.split(',').map(Number));

                // Определяем высоту либо по ELEV, если он есть,
                // либо по координатам первой точки
                const elevation = defineElevation(geometry.ELEV, points[0], contours);
                const linePoints = removeThirdParameter(points);
                contours[elevation].push(linePoints);
                }
        }
    }
    return contours;
}

// Geojson
function GeojsonParse(data) {

    const file = JSON.parse(data);
    const contours = {};
    const features = file.features;

    // Обрабатываем каждую фигуру в features
    for (const feature of features) {

        const featureCoordinates = feature.geometry.coordinates;
        if (!featureCoordinates) continue;
        const featureType = feature.geometry.type;

        // Если объект - линия/точка, то [[координата]]
        let isPoly = false;
        let firstPoint = featureCoordinates[0];
        
        // Если же полигон, то [[[координата]]]
        if (featureType === 'Polygon') {
            isPoly = true;
            firstPoint = featureCoordinates[0][0]
        }

        // Получение высоты в properties (для geojson созданных в qgis)
        const properties = feature.properties;
        const elevationData = properties.ELEV ?? properties.elevation ?? properties.elevationStart ?? NaN;
        const elevation = defineElevation(elevationData, firstPoint, contours)

        // ПОЛИГОН
        if (isPoly) {

            // Оставляем в списке координат точек всё кроме высоты
            const lines = featureCoordinates.map(
                line => removeThirdParameter(line));

            // Перебираем каждый полигон и пушим его в словарь
            for (let i = 0; i < lines.length; i++) {
                contours[elevation].push(lines[i])
            }
        }

        // ЛИНИЯ/ТОЧКА
        else {

            let geometry

            if (featureType === 'LineString') {
            geometry = removeThirdParameter(featureCoordinates);
            } else if (featureType == 'Point') {
            geometry = removeThirdParameter([featureCoordinates]);
            }

            contours[elevation].push(geometry);
        }
    }

    return contours
}

// Здесь выбирается значение для ключа высоты в словаре
function defineElevation(elevationData, firstPoint, contours) {
    const elevation = elevationData !== undefined
            ? parseInt(elevationData)                     // Если ELEV был найден, то преобразуем его в число
            : (Math.round(firstPoint[2] ?? 0));           // если нет ELEV — берем высоту из третьего числа координат
    if (!contours[elevation]) {contours[elevation] = []}; // Заодно создаем ключ высоты в contours, если такой высоты еще нет
    return elevation
}

// Функция, оставляющая только широту и долготу и убирающая третий параметр (высоту), если он есть
function removeThirdParameter(linePoints) {
    return linePoints.map(p => [p[0], p[1]])  
}

module.exports = {
  KMLParse,
  GeojsonParse
}
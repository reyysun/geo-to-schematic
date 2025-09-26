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
const elevationNames = ["ele","elev","elevation","elevationstart"]

// KML
function KMLParse(data) {
    const xml = new DOMParser().parseFromString(data, "text/xml"); 

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

    const contours = {};

    // Функция, принимающая геометрии (feature.geometry) и пушащая координаты из них в contours.
    // (contours[elevation].push(coords))
    function getCoordsOfFeature(geometry, featureProps) {

        const featureType = geometry.type;
        const featureCoordinates = geometry.coordinates;
        
        // Нахождение свойства высоты в featureProps
        let elevationData = undefined;
        if (featureProps) {
            // пробегаем по всем ключам объекта
            for (const key of Object.keys(featureProps)) {
                if (elevationNames.includes(key.toLowerCase())) {
                    elevationData = featureProps[key];
                    break;
                }
            }
        }

        let coords

        // coords надо привести к виду coords = [ [ [lat,lon],[lat,lon] ],[ [lat,lon] ] ]
        switch (featureType) {

            case "Polygon":
                coords = featureCoordinates;
                break
            
            case "LineString": 
                coords = [ featureCoordinates ];
                break
            
            case "Point":
                coords = [ [featureCoordinates] ];
                break

            case "MultiPolygon":
                coords = featureCoordinates.flatMap(
                    poly => poly);
                break
            
            case "MultiLineString":
                coords = featureCoordinates;
                break
            
            case "MultiPoint":
                coords = featureCoordinates.map(point => [point]);
                break
            
            case "GeometryCollection":
                // В случае с коллекцией геометрий просто повторяем эту функцию для каждой вложенной геометрии
                geometry.geometries.forEach(g => {
                    getCoordsOfFeature(g, featureProps);
                })
                return
            
        }
        if (!coords) { return }

        // Подтверждаем полученную из свойств elevationData, 
        // либо берем высоту из координат, если elevationData не определен
        const elevation = defineElevation(elevationData, coords[0][0], contours)

        // Удаляем 3 параметр из координат каждого объекта и пушим в словарь
        for (let i = 0; i < coords.length; i++) {

          clearedCoords = removeThirdParameter(coords[i])
          contours[elevation].push(clearedCoords)

        }
        
    }

    const file = JSON.parse(data);
    const features = file.features;

    for (const feature of features) {
        getCoordsOfFeature(feature.geometry, feature.properties)
    }
    return contours
    
}

// Здесь выбирается значение для ключа высоты в словаре
function defineElevation(elevationData, firstPoint, contours) {
    const elevation = elevationData !== undefined
            ? parseInt(elevationData)                     // Если ELEV был найден, то преобразуем его в число
            : (Math.round(firstPoint[2] ?? 0));           // если нет ELEV — берем высоту из третьего числа координат, либо 0
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
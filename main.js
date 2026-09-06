import { KMLParse, GeojsonParse } from './geoparser.js'
import { getTranslationByKey } from './lang.js'

// Загрузка фона
document.body.classList.add('bg-loaded');

// Переменные всех элементов страницы
const fileInput = document.getElementById('fileInput');
const exportButton = document.getElementById('export-button')
const statusText = document.getElementById('status');
const blockIdInput = document.getElementById('blockId-input');

const XOffsetInput = document.getElementById('doXOffset-input');
const YOffsetInput = document.getElementById('doYOffset-input');
const ZOffsetInput = document.getElementById('doZOffset-input');
const bteOffsets = document.getElementById('bteOffset-select');

const formatBox = document.getElementById('schematicver-select');
const consElevCheck = document.getElementById('consElev-check');
const doFillCheck = document.getElementById('doFill-check');
const fillBlockIdBox = document.getElementById('fillBlockId-input');
const makeFoundationCheck = document.getElementById('make-foundation');
const foundationBlockIdBox = document.getElementById('foundationBlockId-input');
const foundationThicknessBox = document.getElementById('foundationThickness-input');
const interpolateCheck = document.getElementById('interpolate-contours');

const previewCanvas = document.getElementById('preview-canvas');
const previewButton = document.getElementById('hidepreview-button');

// Хэндлеры
exportButton.addEventListener('click', start);
previewButton.addEventListener('click', previewEnableClick)
bteOffsets.addEventListener('change', chooseOffsetPreset);
doFillCheck.addEventListener('change', doFillClick);
makeFoundationCheck.addEventListener('change', doFoundationClick);

let converterLoaded = false;
let previewEnabled = true;

// Lazy loading of ultraconverter.min.js
function loadConverter() {
    return new Promise((resolve, reject) => {

        if (converterLoaded) {
            console.log('Converter already loaded')
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = './ultraconverter.min.js';

        script.onload = () => {
            console.log('Converter loaded');
            converterLoaded = true;
            resolve();
        };

        script.onerror = () => {
            statusUpdate('status_error_loadconverter','salmon')
            reject('Failed to load converter');
        };

        document.body.appendChild(script);
    });
}

// "Export" button click
async function start() {
    const files = fileInput.files;
    if (files.length == 0) {
        statusUpdate('status_upload', 'salmon');
        return
    }
    statusUpdate('status_converting', 'wheat');
    
    await loadConverter();

    const promises = [];
    try {
        for (let i = 0; i < files.length; i++) {
            const filePromise = processFile(files[i]);
            const supposedName = files[i].name.substr(0, files[i].name.lastIndexOf('.'));;
            const resultPromise = filePromise.then(parsedData => {
                return [parsedData, supposedName]
            })
            promises.push(resultPromise);

        }
        const parsedDataList = await Promise.all(promises);
        console.log('All promises done');
        
        processData(parsedDataList);

    } catch (err) {
        statusUpdate('status_error_whileprocessing', 'salmon');
        console.log(err);
        return
    }
}

//
function createExportFile(exportData) {

    const toExport = exportData[0]
    const isZip = exportData[1]
    let name = exportData[2]
    const originPoint = exportData[3]
    const visualizationData = exportData[4]
    if (!name) { name = 'geotoschematic' }
    
    let ext;
    let blobtype;
    if (isZip) { 
        blobtype = 'application/zip' 
        ext = '.zip'; 
    }
    else {
        blobtype = 'application/nbt'
        if (formatBox.value == "Legacy") { 
            ext = '.schematic' 
        } 
        else { 
            ext = '.schem' 
        };
    }
    name += ext;
    

    const blob = new Blob([toExport], {type: blobtype});
    const listelement = document.createElement('div');
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = name;
    link.innerHTML = 'Download ' + name;
    link.click();
    
    listelement.appendChild(link);
    
    //li.appendChild(document.createTextNode(` (${result[1].join(' ')})`)) // result[1] - это originalPoint
    
    if (originPoint) {
        const explanationText = getTranslationByKey('originexplanation')
        const origin = document.createElement('span');
        origin.classList.add('tooltip');
        origin.innerHTML='🎯'
        const originTooltip = document.createElement('span')
        originTooltip.classList.add('tooltip-text');
        originTooltip.innerHTML=`<strong>Origin block: ${originPoint.join(' ')}.</strong>
        <hr><span>${explanationText}</span>`
        origin.appendChild(originTooltip)
        listelement.appendChild(origin);
    }
    
    const li = document.createElement('li');
    li.appendChild(listelement)
    document.querySelector('#downloads').appendChild(li);
    
    if (visualizationData && previewEnabled) {
        visualize(visualizationData);
    }

    statusUpdate('status_success', 'MediumSeaGreen');

}

function visualize(data) {
    const ctx = previewCanvas.getContext("2d");
    const grid = data[0];
    const minElev = data[1];
    const maxElev = data[2];

    const rows = grid.length;
    const cols = grid[0].length;

    const scale = Math.min(
        375 / cols,
        375 / rows
    );

    const width = Math.floor(cols * scale);
    const height = Math.floor(rows * scale);

    previewCanvas.width = width;
    previewCanvas.height = height;

    ctx.imageSmoothingEnabled = false;

    // Не делаем минимальную высоту совсем черной.
    // Яркость будет от 30% до 100%.
    let minBrightness = 0.3;
    if (maxElev - minElev < 4) {
        minBrightness = 0.7
    }

    // Рисуем
    for (let gz = 0; gz < rows; gz++) {
        for (let gx = 0; gx < cols; gx++) {

            const cell = grid[gz][gx];

            if (
                cell.type !== "contour" &&
                cell.type !== "filled"
            ) {
                continue;
            }

            // Нормализованная высота 0..1
            let normalized;

            if (maxElev === minElev) {
                normalized = 1;
            } else {
                normalized =
                    (Math.max(...cell.elev) - minElev) /
                    (maxElev - minElev);
            }

            const brightness =
                minBrightness +
                normalized * (1 - minBrightness);

            const value = Math.round(255 * brightness);

            if (cell.type === "contour") {
                // Синий: от темно-синего до ярко-синего
                ctx.fillStyle = `rgb(0, 0, ${value})`;
            } else {
                // Зеленый: от темно-зеленого до ярко-зеленого
                ctx.fillStyle = `rgb(0, ${value}, 0)`;
            }

            ctx.fillRect(
                Math.floor(gx * scale),
                Math.floor(gz * scale),
                Math.ceil(scale),
                Math.ceil(scale)
            );
        }
    }
}

function processFile(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();

        fr.onload = function() {

            const unparsedData = fr.result
            const name = file.name.toLowerCase();

            let fileType;
            if (name.endsWith('.kml')) {
                fileType = 'kml'
            } else if (name.endsWith('.geojson') || name.endsWith('.json')) {
                fileType = 'geojson'
            } else {
                alert(getTranslationByKey['alert_error_wrongextension'])
                return
            }

            try {
                let parsedData;
                if (fileType == 'kml') {parsedData = KMLParse(unparsedData)}
                else if (fileType == 'geojson') {parsedData = GeojsonParse(unparsedData)}
                else { return }
                resolve(parsedData);
            }
            catch (err) {
                console.log(err)
                statusUpdate('status_error', 'salmon');
                return
            }
        }
        
        fr.readAsText(file);
    });
}

function processData(parsedDataList) {

    const blockId = blockIdInput.value.trim();
    const xOffset = parseInt(XOffsetInput.value.trim());
    const yOffset = parseInt(YOffsetInput.value.trim());
    const zOffset = parseInt(ZOffsetInput.value.trim());
    const offset = [xOffset, yOffset, zOffset];
    const consElev = consElevCheck.checked;
    const doFill = doFillCheck.checked;
    const schemVersion = formatBox.value;
    const fillBlockId = fillBlockIdBox.value.trim();
    const makeFoundation = makeFoundationCheck.checked;
    const foundationBlockId = foundationBlockIdBox.value.trim();
    const foundationThickness = parseInt(foundationThicknessBox.value);
    const interpolate = interpolateCheck.checked;

    console.log('blockId: ',blockId);
    console.log('offset: ',offset);
    console.log('consElev: ',consElev)
    console.log('doFill: ',doFill);
    doFill && console.log('fillBlockId: ',fillBlockId);
    console.log('schemVersion: ',schemVersion);

    function isDigit(str) {return /[^0-9]/.test(str)}
    // Проверка всех инпутов
    const blockinput = [blockId, fillBlockId, foundationBlockId];
    let blockinputvalid = true;
    for (let i = 0; i<blockinput.length; i++) {
        if (!isDigit(blockinput[i])) {
            alert(getTranslationByKey('alert_error_wrongid'));
            blockinputvalid = false;
            return
        } else if (blockinput[i] == 'air') {
            alert(getTranslationByKey('alert_air'));
            blockinputvalid = false;
            return
        }
    }
    if (!blockinputvalid) { return }
    else if (!offset.every(item => Number.isInteger(item))) {
        alert(getTranslationByKey('alert_error_offset'));
        return
    }

    const fillSettings = [doFill, fillBlockId];
    const foundationSettings = [makeFoundation, foundationBlockId, foundationThickness];

    const converter = window.convertGeoData;
    // Получение текста сообщения о слишком большом объеме блоков, на случай, если он пригодится
    const largeConfirmation = getTranslationByKey('alert_toomuchvolume')

    let result;
    try {
        result = converter(
        parsedDataList, blockId, offset, schemVersion, consElev, fillSettings, foundationSettings, largeConfirmation, interpolate, previewEnabled)
        console.log('Successful conversion! Now doing download...')

    } catch (err) {
        switch (err.message) {
            case "Schematic too big":
                statusUpdate('status_error_exceedminecraftlimit', 'salmon');
                break;
            case "Wrong block id":
                // This can occur only if Legacy schematic selected
                statusUpdate('status_error_wronglegacyid', 'salmon');
                break;
            case "Wrong coordinates format":
                statusUpdate('status_error_wrongcoordsformat', 'salmon');
                break;
            case "Cancel converting":
                statusUpdate('status_cancel', 'salmon');
                break;
            default:
                statusUpdate('status_error_unknown', 'salmon');
        }
        console.log(err);
        return
    } finally {
        fileInput.value = null;
    }

    createExportFile(result);

}

function chooseOffsetPreset(e) {
    const clickedbutton = e.target.value;
    
    switch (clickedbutton) {
    case 'offsetNone':
        applyOffset(0, 0, 0);
        break
    case 'offsetAsean':
        applyOffset(-13379008, 0, 2727648);
        break
    case 'offsetItaly':
        applyOffset(0, -2016, 0);
        break
    case 'offsetAsia':
        applyOffset(0, -1872, 0);
        break
    case 'offsetRomania':
        applyOffset(0, -544, 0);
        break
    case 'offsetBalkans':
        applyOffset(0, -1024, 0);
        break
    }
}

function applyOffset(x, y, z) {
    XOffsetInput.value = x;
    YOffsetInput.value = y;
    ZOffsetInput.value = z;
}

function doFillClick() {
    const enabled = doFillCheck.checked;
    fillBlockIdBox.disabled = !enabled; // вкл/выкл строку ввода filling block
    // Смена заднего фона
    document.body.classList.toggle('bg-alt', enabled);
}

function doFoundationClick() {
    const enabled = makeFoundationCheck.checked;
    foundationBlockIdBox.disabled = !enabled;
    foundationThicknessBox.disabled = !enabled;
}

function previewEnableClick() {
    if (previewEnabled) {
        previewCanvas.style.display = "none";
        previewButton.textContent = getTranslationByKey('off')
        previewButton.style.color = 'salmon';
        previewEnabled = false
    } else {
        previewCanvas.style.display = "grid";
        previewButton.textContent = getTranslationByKey('on')
        previewButton.style.color = 'lime';
        previewEnabled = true
    }
}

function statusUpdate(langKey, color) {
    const text = getTranslationByKey(langKey);
    statusText.textContent = text;
    statusText.style.color = color;
}

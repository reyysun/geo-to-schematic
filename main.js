import { KMLParse, GeojsonParse } from './geoparser.js'

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

const formatBox = document.getElementById('schematicver-select');
const consElevCheck = document.getElementById('consElev-check');
const doFillCheck = document.getElementById('doFill-check');
const fillBlockIdBox = document.getElementById('fillBlockId-input');
const bteOffsets = document.getElementById('bteOffset-select');

exportButton.addEventListener('click', start);
bteOffsets.addEventListener('change', chooseOffsetPreset);
doFillCheck.addEventListener('change', doFillClick);

//
function createExportFile(exportData) {

    const toExport = exportData[0]
    const isZip = exportData[1]
    let name = exportData[2]
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
    

    var blob = new Blob([toExport], {type: blobtype});
    var link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = name;
    link.innerHTML = 'Download ' + name;
    link.click();
    var li = document.createElement('li');
    li.appendChild(link);
    //li.appendChild(document.createTextNode(` (${result[1].join(' ')})`)) // result[1] - это originalPoint
    document.querySelector('#downloads').appendChild(li);

    statusUpdate('Success! Use "//paste -a -o" to correctly place your schematic', 'MediumSeaGreen');

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
                alert('Only .kml and .geojson files are supported')
                return
            }

            let parsedData;
            if (fileType == 'kml') {parsedData = KMLParse(unparsedData)}
            else if (fileType == 'geojson') {parsedData = GeojsonParse(unparsedData)}
            else { return }

            resolve(parsedData);
        }
        fr.onerror = function() {
            console.log('Error reading file')
            reject()
        }
        
        fr.readAsText(file);
    });
}

async function start() {
    statusUpdate('Converting...', 'wheat');
    const files = fileInput.files;

    const promises = [];
    let supposedName;
    for (let i = 0; i < files.length; i++) {
        const filePromise = processFile(files[i]);
        const supposedName = files[i].name.substr(0, files[i].name.lastIndexOf('.'));;
        const resultPromise = filePromise.then(parsedData => {
            return [parsedData, supposedName]
        })
        promises.push(resultPromise);

    }
    try {
        const parsedDataList = await Promise.all(promises)
        console.log('Все файлы обработаны')
        
        processData(parsedDataList)

    } catch (error) {
        console.log(error)
    }
}

function processData(parsedDataList) {

    const blockId = blockIdInput.value;
    const xOffset = parseInt(XOffsetInput.value);
    const yOffset = parseInt(YOffsetInput.value);
    const zOffset = parseInt(ZOffsetInput.value);
    const offset = [xOffset, yOffset, zOffset];
    const consElev = consElevCheck.checked;
    const doFill = doFillCheck.checked;
    const schemVersion = formatBox.value;
    const fillBlockId = fillBlockIdBox.value;
    

    console.log('blockId: ',blockId);
    console.log('offset: ',offset);
    console.log('consElev: ',consElev)
    console.log('doFill: ',doFill);
    doFill && console.log('fillBlockId: ',fillBlockId);
    console.log('schemVersion: ',schemVersion);

    function isDigit(str) {return /[^0-9]/.test(str)}
    if ( !isDigit(blockId) || !isDigit(fillBlockId) ) {
        alert('Please enter a valid Minecraft block ID. Only text IDs are supported');
        return
    }
    if (!offset.every(item => Number.isInteger(item))) {
        alert('Please enter correct offset values. Offset values can only be integers')
        return
    }

    let result;
    console.log('PARSEDDATALIST: ',parsedDataList)
    try {
        result = window.convertGeoData(
        parsedDataList, blockId, offset, schemVersion, consElev, doFill, fillBlockId)
        console.log('Successful conversion! Now doing download...')

    } catch (err) {
        if (err.message === "Schematic too big") {
        statusUpdate(
            `Hold on, your file is too big for one schematic! 
            How about splitting it into smaller ones?`, 'salmon'
        )
        }
        else if (err.message === "Wrong block id") {
        // This can occur only if Legacy schematic selected
        statusUpdate(`Wrong block ID, please use text IDs of blocks
                        that are presented in 1.12.2`, 'salmon')
        }
        else if (err.message === "temporary cant do legacy with fill") {
        statusUpdate(`Sorry, it's currently not possible to apply 
                        terrain fill to Legacy schematics. Please use 
                        Sponge schematics.`, 'salmon')
        }
        else { statusUpdate(
        'Unknown error =(', 'salmon') }
        console.log(err)
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
    document.body.classList.toggle('bg-alt', enabled);
}

function statusUpdate(text, color) {
    statusText.textContent = text;
    statusText.style.color = color
}

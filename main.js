const fs = require("fs");
const path = require('path');
const JSZip = require("jszip");
const argparse = require('argparse');
const { folder } = require("jszip");
const lumpimlib = require("./lumpimlib.js")

let parser = new argparse.ArgumentParser({
  description: 'i pak the pk3'
});

let defaults = {
    nameToOrder: {
        "S_SKIN": -5,
        "P_SKIN": -5,
        "S_END": 105,
    }
}

parser.add_argument('folder', { help: 'its the folder to pak' });
parser.add_argument('dest', { help: 'where the pk3 goes' });
parser.add_argument('-p', '--program', { help: 'what uses the pk3 with a -file arg' });
parser.add_argument('-d', '--debug', { action: 'store_true', help: 'should i tell you all the things' });
parser.add_argument('-e', '--extra', { nargs: argparse.REMAINDER, help: 'more args to pass to the program\nput this after everything else it will eat up the arguments' });
 
let args = parser.parse_args()

// pak it
console.log(`\x1b[36;1mPacking ${path.basename(args.dest)}...\x1b[0m`)

function processFilename(filename) {
    let stat = fs.statSync(filename)
    let data = {
        name: path.basename(filename),
        type: null,
        order: 0
    }
    if (stat.isDirectory()) {
        data.order = 100
        data.type = "folder"
    } else {
        data.type = "file"
        data.data = fs.readFileSync(filename)
    }
    Object.keys(defaults.nameToOrder).forEach(prefix => {
        if (data.name.startsWith(prefix)) {
            data.order = defaults.nameToOrder[prefix]
        }
    })
    if (args.debug) {
        //console.warn(`DEBUG: ${filename}'s name is ${data.name}, order ${data.order}`)
    }
    return data
}

/**
 * 
 * @param {JSZip} zipfolder 
 * @param {*} folderpath 
 */
function doTheFolder(zipfolder, folderpath, relpath) {
    // btw you cant sort folders
    let files = fs.readdirSync(folderpath)
    let items = []
    files.forEach(item => {
        let itempath = path.join(folderpath, item)
        let meta = processFilename(itempath)
        items.push(meta)
    })
    items.sort((a, b) => (a.order - b.order + (a.name < b.name ? -0.1 : 0.1)))
    if (args.debug) {
        console.log(items.map(i => {
            return {
                order: i.order,
                name: i.name,
                type: i.type
            }
        }))
    }
    items.forEach(item => {
        if (item.type == "folder") {
            let subfolder = zipfolder.folder(item.name)
            doTheFolder(subfolder, path.join(folderpath, item.name), path.join(relpath, item.name))
        } else {
            if (item.name.endsWith(".png")) {
                console.log(`\x1b[34;1mConverting ${path.join(relpath, item.name)}...\x1b[0m`)
                item.name = item.name.slice(0, -4)
                item.data = lumpimlib.png2lmp(item.name, item.data)
            }
            zipfolder.file(item.name, item.data)
        }
    })
}

let zip = new JSZip();
//zip.folder("Lua").file("cheeselua", "addHook('MobjThinker', function(m)if m.player then m.player.rings = 1 end P_DamageMobj(m) end)")
doTheFolder(zip, args.folder, "")

zip.generateNodeStream(
    {
        type: 'nodebuffer',
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    }
).pipe(fs.createWriteStream(args.dest))

console.log(`\x1b[32;1mPacked!\x1b[0m`)

function isExecutable(filePath) {
    if (process.platform == 'win32') {
        return (['.exe', '.bat', '.cmd', '.com']).includes(path.extname(filePath).toLowerCase())
    } else {
        return (fs.statSync(filePath).mode & fs.X_OK) > 0
    }
}

if (args.program) {
    try {
        let stat = fs.statSync(args.program)
        if (isExecutable(args.program)) {
            const child_process = require('child_process');
            console.log(`\x1b[36;1mRunning ${path.basename(args.program)}\x1b[0m`)
            process.stdin.setRawMode(false);
            let child = child_process.spawn(args.program, (["-file", path.resolve(args.dest)]).concat(args.extra ?? []), { cwd: path.dirname(args.program), stdio: "inherit" })
        } else {
            console.error(`\x1b[31;1mError running program:\x1b[0m not executable`)
        }
    } catch (e) {
        console.error(`\x1b[31;1mError running program:\x1b[0m ${e}`)

    }
}

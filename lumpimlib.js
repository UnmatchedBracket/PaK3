const deasync = require('deasync')
const Jimp = require("jimp")
const pallete = require("./pallete.js")

const TRANSTHRESH = 100

function hex2rgb(hex) {
    return [
        (hex >> 0o20) & 0xff,
        (hex >> 0o10) & 0xff,
        hex & 0xff
    ]
}

function hex2rgba(hex) {
    return [
        (hex >> 0o30) & 0xff,
        (hex >> 0o20) & 0xff,
        (hex >> 0o10) & 0xff,
        hex & 0xff
    ]
}

function colorDist(rgb1, rgb2) {
    return Math.hypot(rgb1[0] - rgb2[0], rgb1[1] - rgb2[1], rgb1[2] - rgb2[2])
}

let closestCache = {}
function closestOnPalette(rgb) {
    if (closestCache[rgb]) return closestCache[rgb]

    let result = -1
    let dist = 9999

    for (let i = 0; i < pallete.length; i++) {
        let tmpDist = colorDist(rgb, pallete[i])
        if (tmpDist < dist) {
            result = i
            dist = tmpDist
        }
    }

    closestCache[rgb] = result
    return result
}

/**
 * 
 * @param {Jimp} jimage 
 * @param {*} colno 
 */
function genColumn(jimage, x) {
    let posts = []
    let activePost = null
    let imHeight = jimage.getHeight()
    for (let y = 0; y <= imHeight; y++) {
        let pixColor = (y < imHeight) ? hex2rgba(jimage.getPixelColor(x, y)) : null
        if (pixColor && pixColor[3] > TRANSTHRESH) {
            if (!activePost) {
                activePost = {
                    topdelta: y,
                    length: 0,
                    data: []
                }
            }
            activePost.length += 1
            activePost.data.push(closestOnPalette(pixColor.slice(0, 3)))
        } else if (activePost) {
            posts.push(activePost)
            activePost = null
        }
    }
    let buf = Buffer.alloc(1 + posts.map(post => 4 + post.length).reduce((a, b) => a+b, 0))
    let off = 0
    posts.forEach(post => {
        buf.writeUInt8(post.topdelta, off)
        buf.writeUInt8(post.length, off+1)
        //don't write the unused offset+2 byte
        post.data.forEach((byte, bi) => buf.writeUInt8(byte, off+3+bi))
        //don't write the unused offset+3+length byte
        off += post.length + 4
    })
    buf.writeUInt8(0xff, off) // end list
    //console.log("gencol", buf)
    return buf
}

function jimage2lmp(jimage, offset) {
    let headbuf = Buffer.alloc(8 + 4*jimage.getWidth())
    headbuf.writeUInt16LE(jimage.getWidth(), 0)
    headbuf.writeUInt16LE(jimage.getHeight(), 2)
    headbuf.writeInt16LE(offset[0], 4)
    headbuf.writeInt16LE(offset[1], 6)
    let coldat = []
    for (let x = 0; x < jimage.getWidth(); x++) {
        headbuf.writeUInt32LE(headbuf.byteLength + coldat.length, 8 + 4*x)
        coldat = coldat.concat([...genColumn(jimage, x)])
        //console.log(coldat)
    }
    return Buffer.from([...headbuf, ...coldat])
}

/**
 * 
 * @param {Buffer} pngbuf 
 * @returns {number[]?}
 */
function getPNGOffset(pngbuf) {
    let offset = 8

    while (offset < pngbuf.length) {
        let type = pngbuf.slice(offset + 4, offset + 8).toString('ascii')
        let length = pngbuf.slice(offset, offset + 4).readUInt32BE()
        let data = pngbuf.slice(offset + 8, offset + length + 8)

        if (type == "tEXt") {
            let keywordLength = data.indexOf(0)
            let keyword = data.slice(0, keywordLength).toString('ascii')

            if (keyword == "Comment") {
                let comment = data.slice(keywordLength + 1).toString('utf8')
                let numberMatcher = /-?[0-9]+/g
                let xoff = Number(numberMatcher.exec(comment))
                let yoff = Number(numberMatcher.exec(comment))
                if (xoff && yoff) return [xoff, yoff] 
            }
        }
        if (type == "grAb") {
            return [data.readInt32BE(0), data.readInt32BE(4)]
        }
        offset += length + 12
    }

    return null
}

const offsetDefaults = {
    "XTRAA0": [0, 0],
    "XTRAB0": [0, 0],
}

/**
 * Convers a PNG Buffer into a lump Buffer
 * @param {Buffer} pngbuf 
 */
function png2lmp(name, pngbuf) {
    let jimage = deasync(Jimp.read)(pngbuf)
    let offsetDefault = offsetDefaults[name] ?? [
        Math.floor(jimage.getWidth()/2), Math.floor(jimage.getHeight()/2)
    ]
    let off = getPNGOffset(pngbuf) ?? offsetDefault
    return jimage2lmp(jimage, off) // TODO: actually get the offset
}

module.exports = { png2lmp, colorDist, pallete, closestOnPalette, closestCache }
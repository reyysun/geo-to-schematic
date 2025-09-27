const blocksNamespace = require('./blockids')

class Schematic {
  constructor(size, palette, blockdata, origin) {
    this.size = size;
    this.palette = palette;
    this.blockdata = blockdata;
    this.origin = origin;
  }

  SpongeV3() {
    return {
        type: 'compound',
        name: "",
        value: {
          Schematic: {
            type: 'compound',
            name: "Schematic",
            value: {
              Version: { type: 'int', value: 3 },
              DataVersion: { type: 'int', value: 3700 },

              Width: { type: 'short', value: this.size.length },
              Height: { type: 'short', value: this.size.height },
              Length: { type: 'short', value: this.size.width },

              // Исходная точка схематики (//paste -a -o)
              Offset: {
                type: 'intArray',
                value: this.origin,
              },

              Metadata: { 
                type: 'compound', 
                value: {
                  Author: { type: 'string', value: "GeoToSchematic" },
                  Name: { type: 'string', value: "BuildTheEarth schematic" }
                } 
              },
              
              Blocks: {
                type: 'compound', 
                value: {
                  Palette: { type: 'compound', value: this.palette },
                  Data: { type: 'byteArray', value: this.blockdata },
                }
              }
            }
          }
        }
      }
  }

  Legacy() {

    const blockspalette = [];

    for (const key in this.palette) {
      blockspalette[this.palette[key].value] = key;
    }

    let blocks = [];
    let data = [];

    for (let i=0; i < this.blockdata.length; i++) {
      let varInt = 0;
      let varIntLength = 0;
      varInt |= (this.blockdata[i] & 127) << (varIntLength++ * 7);
                
      if ((this.blockdata[i] & 128) == 128) {
        continue;
      }
      
      let blockId;
      if (blockspalette[varInt] in blocksNamespace) {
        blockId = blocksNamespace[blockspalette[varInt]];
      } else {
        throw new Error('Wrong block id');
      }
      
      blocks.push(blockId >> 4);
      data.push(blockId & 0xF);
    }

    return {
      type: 'compound',
      name: "Schematic",
      value: {
        Width: { type: 'short', value: this.size.length },
        Height: { type: 'short', value: this.size.height },
        Length: { type: 'short', value: this.size.width },

        Materials: { type: 'string', value: 'Alpha' },

        Blocks: { type: 'byteArray', value: blocks },
        Data: { type: 'byteArray', value: data },

        WEOriginX: { type: 'int', value: this.origin[0] },
        WEOriginY: { type: 'int', value: this.origin[1] },
        WEOriginZ: { type: 'int', value: this.origin[2] },
        WEOffsetX: { type: 'int', value: 0 },
        WEOffsetY: { type: 'int', value: 0 },
        WEOffsetZ: { type: 'int', value: 0 },

        Entities: {
          type: 'list',
          value: { type: 'compound', value: [] },
        },
        TileEntities: {
          type: 'list',
          value: { type: 'compound', value: [] },
        }
      },
    };
  }
}

module.exports = Schematic;
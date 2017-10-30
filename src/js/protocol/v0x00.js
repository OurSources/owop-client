'use strict';

const protobuf = {
    global: {
        toClient: {
            0x00: [ /* Switch network state */
                {
                    name: 'stateId',
                    type: 'u8'
                }
            ]
        },
        toServer: {}
    },
    0x00: { /* Verify */
        toClient: {
            0x01: [ /* Protocol version */
                { name: 'version', type: 'u8' }
            ],
            0x02: [ /* Captcha status */
                { name: 'status', type: 'u8' }
            ]
        },
        toServer: {
            0x01: [
                { name: 'version', type: 'u8' }
            ],
            0x02: [
                { name: 'token', type: 'string' }
            ]
        }
    },
    0x01: { /* Login */
        toClient: {
            0x01: [ /* Login info */
                { name: 'name', type: 'string' }
            ],
            0x02: [] /* Login status */
        },
        toServer: {
            0x01: [ /* Guest */
                { name: 'name', type: 'string' }
            ],
            0x02: [], /* Login */
            0x03: [] /* Register */
        }
    },
    0x02: { /* Lobby */
        toClient: {
            0x01: [ /* Player count */
                { name: 'count', type: 'u32' }
            ],
            0x02: [ /* MOTD */
                { name: 'motd', type: 'string' }
            ],
            0x03: [ /* Set world */
                { name: 'name', type: 'string' }
            ]
        },
        toServer: {
            0x01: [ /* Join world */
                { name: 'name', type: 'string' }
            ],
            0x02: [] /* Log out */
        }
    },
    0x03: {
        toClient: {
            0x01: [ /* Set ID */
                { name: 'id', type: 'u32' }
            ],
            0x02: [ /* Chunk data */
                { name: 'x', type: 'i32' },
                { name: 'y', type: 'i32' },
                { name: 'data', type: 'compressedArray', itemType: 'u16' } /* Size is defined in the compressed data */
            ],
            0x03: [ /* Area subscribe status */
                { name: 'state', type: 'u8' },
                { name: 'x', type: 'i32' },
                { name: 'y', type: 'i32' }
            ],
            0x04: [ /* Client sync */
                { name: 'tool', type: 'u8' },
                { name: 'x', type: 'i32' },
                { name: 'y', type: 'i32' },
                { name: 'perms', type: 'u8' }
            ],
            0x05: [ /* Action rejected */
                { name: 'action', type: 'u8' }
                /* TODO - different data for different actions */
            ],
            0x06: [ /* World state */
                { name: 'players', type: 'array', sizeType: 'u8', itemType: [
                    { name: 'id', type: 'u32' },
                    { name: 'x', type: 'i32' },
                    { name: 'y', type: 'i32' },
                    { name: 'color', type: 'u16' },
                    { name: 'tool', type: 'u8' }
                ]},
                { name: 'pixels', type: 'array', sizeType: 'u16', itemType: [
                    { name: 'x', type: 'i32' },
                    { name: 'y', type: 'i32' },
                    { name: 'rgb', type: 'u16' }
                ]},
                { name: 'playersLeft', type: 'array', sizeType: 'u8', itemType: [
                    { name: 'id', type: 'u32' }
                ]},
                { name: 'totalPlayers', type: 'u32' }
            ],
            0x07: [

            ],
            0x08: [

            ]
        },
        toServer: {
            0x01: [
                
            ],
            0x02: [
                
            ],
            0x03: [

            ],
            0x04: [

            ],
            0x05: [

            ],
            0x06: [

            ],
            0x07: []
        }
    }
};
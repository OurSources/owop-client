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
                { name: 'version',
                type: 'u8' }
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
            0x01: [
                { name: 'id', type: 'u32' }
            ],
            0x02: [ /* Chunk data */
                { name: 'x', type: 'u32' },
                { name: 'y', type: 'u32' },
                { name: 'data', type: 'u8arr', size: null } /* read till message end if size not defined */
            ],
            0x03: [

            ],
            0x04: [

            ],
            0x05: [

            ],
            0x06: [

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
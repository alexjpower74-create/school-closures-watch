// Picks the API module: api.mock.js with ?mock=1, else api.js.
import { isMock } from './params.js'

export const api = await (isMock ? import('./api.mock.js') : import('./api.js'))

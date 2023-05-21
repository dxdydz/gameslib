/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-var-requires */
import { GameBase, IAPGameState, IClickResult, IIndividualState, IStashEntry, IScores, IValidationResult } from "./_base";
import { APGamesInformation } from "../schemas/gameinfo";
import { APRenderRep } from "@abstractplay/renderer/src/schemas/schema";
import { APMoveResult } from "../schemas/moveresults";
import { RectGrid, reviver, UserFacingError } from "../common";
import i18next from "i18next";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const deepclone = require("rfdc/default");

export type playerid = 1|2;
export type Piece = "B"|"P"|"E"|"Ex";
export type Facing = "N"|"E"|"S"|"W"|undefined
export type CellContents = [playerid, Piece, Facing];

interface IPointEntry {
    row: number;
    col: number;
}

type NumBases = number;
type NumPowers = number;
type NumEnforcers = number;
type GamePhase = "initialBase"|"initialPower"|"play";

export interface IMoveState extends IIndividualState {
    currplayer: playerid;
    board: Map<string, CellContents>;
    lastmove?: string;
    pieces: [[NumBases,NumPowers,NumEnforcers],[NumBases,NumPowers,NumEnforcers]];
    captured: [NumBases,NumBases];
    phase: GamePhase;
};

export interface IRealmState extends IAPGameState {
    winner: playerid[];
    stack: Array<IMoveState>;
};

export class RealmGame extends GameBase {
    public static readonly gameinfo: APGamesInformation = {
        name: "Realm",
        uid: "realm",
        playercounts: [2],
        version: "20230521",
        // i18next.t("apgames:descriptions.realm")
        description: "apgames:descriptions.realm",
        urls: ["https://boardgamegeek.com/boardgame/3024/realm"],
        people: [
            {
                type: "designer",
                name: "Phil Orbanes, Sr."
            }
        ],
        variants: [
            {
                uid: "moreBase",
                group: "bases"
            },
            {
                uid: "lessBase",
                group: "bases"
            },
            {
                uid: "moreEnforcer",
                group: "enforcers"
            },
            {
                uid: "lessEnforcers",
                group: "enforcers"
            },
            {
                uid: "morePower",
                group: "powers"
            },
            {
                uid: "capturedBases",
                group: "ties"
            },
            {
                uid: "lastFirst",
            },
            {
                uid: "replacement",
            },
            {
                uid: "charley",
            },
            {
                uid: "control",
            },
            {
                uid: "relaxed",
            },
        ],
        flags: ["multistep", "player-stashes", "scores", "limited-pieces", "no-moves"]
    };

    public static coords2algebraic(x: number, y: number): string {
        return GameBase.coords2algebraic(x, y, 12);
    }
    public static algebraic2coords(cell: string): [number, number] {
        return GameBase.algebraic2coords(cell, 12);
    }
    public static newFacing(from: string, to: string): Facing {
        const [x1, y1] = this.algebraic2coords(from);
        const [x2, y2] = this.algebraic2coords(to);
        // Naive and simple
        // Doesn't try to deal with error edge cases
        if (y2 < y1) {
            return "N";
        } else if (y2 < y1) {
            return "S";
        } else if (x2 < x1) {
            return "W";
        } else if (x2 > x1) {
            return "E";
        }
        return undefined;
    }

    public numplayers = 2;
    public currplayer: playerid = 1;
    public board!: Map<string, CellContents>;
    public gameover = false;
    public winner: playerid[] = [];
    public variants: string[] = [];
    public stack!: Array<IMoveState>;
    public results: Array<APMoveResult> = [];
    public pieces!: [[NumBases,NumPowers,NumEnforcers],[NumBases,NumPowers,NumEnforcers]];
    public captured: [NumBases,NumBases] = [0,0];
    public phase: GamePhase = "initialBase";

    constructor(state?: IRealmState | string, variants?: string[]) {
        super();
        if (state === undefined) {
            const board = new Map<string, CellContents>();
            const fresh: IMoveState = {
                _version: RealmGame.gameinfo.version,
                _results: [],
                _timestamp: new Date(),
                currplayer: 1,
                board,
                pieces: [[12,3,8], [12,3,8]],
                captured: [0,0],
                phase: "initialBase"
            };
            if ( (variants !== undefined) && (variants.length > 0) ) {
                let numBases = 12;
                let numPowers = 3;
                let numEnforcers = 8;
                for (const v of variants) {
                    switch (v) {
                        case "moreBase":
                            numBases++;
                            break;
                        case "lessBase":
                            numBases--;
                            break;
                        case "morePower":
                            numPowers++;
                            break;
                        case "moreEnforcer":
                            numEnforcers++
                            break;
                        case "lessEnforcer":
                            numEnforcers--;
                            break;
                        default:
                            this.variants.push(v);
                            break;
                    }
                }
                fresh.pieces = [[numBases,numPowers,numEnforcers], [numBases,numPowers,numEnforcers]]
            }
            this.stack = [fresh];
        } else {
            if (typeof state === "string") {
                state = JSON.parse(state, reviver) as IRealmState;
            }
            if (state.game !== RealmGame.gameinfo.uid) {
                throw new Error(`The Realm engine cannot process a game of '${state.game}'.`);
            }
            this.gameover = state.gameover;
            this.winner = [...state.winner];
            this.variants = [...state.variants];
            this.stack = [...state.stack];
        }
        this.load();
    }

    public load(idx = -1): RealmGame {
        if (idx < 0) {
            idx += this.stack.length;
        }
        if ( (idx < 0) || (idx >= this.stack.length) ) {
            throw new Error("Could not load the requested state from the stack.");
        }

        const state = this.stack[idx];
        this.currplayer = state.currplayer;
        this.board = new Map(state.board);
        this.lastmove = state.lastmove;
        this.pieces = deepclone(state.pieces) as [[number,number,number],[number,number,number]];
        this.results = [...state._results];
        return this;
    }

    public handleClick(move: string, row: number, col: number, piece?: string): IClickResult {
        try {
            if (!this.validateMove(move).valid)
                return {move, message: ""} as IClickResult;
            const cell = RealmGame.coords2algebraic(col, row);
            let newmove = "";
            const stash = this.pieces[this.currplayer - 1];
            let smallest: number | undefined;
            for (let i = 0; i < 3; i++) {
                if (stash[i] > 0) {
                    smallest = i + 1;
                    break;
                }
            }
            if (move === "") {
                // if all workers have been placed
                if (this.board.size >= 2) {
                    // empty space could be a placement because movement is optional
                    if (! this.board.has(cell)) {
                        if (smallest === undefined) {
                            newmove = "pass";
                        } else if (this.findPoints().includes(cell)) {
                            newmove = `${smallest}${cell}`;
                        } else {
                            return {move: "", message: ""} as IClickResult;
                        }
                    } else {
                        // occupied space must be a worker
                        if (this.board.get(cell)![0] === 0) {
                            newmove = cell;
                        } else {
                            return {move: "", message: ""} as IClickResult;
                        }
                    }
                // otherwise, early phases
                } else {
                    // only empty spaces can be clicked
                    if (! this.board.has(cell)) {
                        newmove = cell;
                    } else {
                        return {move: "", message: ""} as IClickResult;
                    }
                }
            } else {
                let [from, to, place] = move.split(/[-,]/);
                if (place === undefined && move.includes(',')) { // this happens when user clicks on stash (without movement)
                    place = to;
                    to = '';
                }
                if ( (this.board.size <= 2) && (from.length === 2) ) {
                    if (! this.board.has(cell)) {
                        newmove = cell;
                    } else {
                        newmove = move;
                    }
                } else if ( (place !== undefined) || (from.length !== 2) ) {
                    let pSize: number; let pCell: string;
                    if (place !== undefined) {
                        pSize = parseInt(place[0], 10);
                        pCell = place.slice(1);
                    } else {
                        pSize = parseInt(from[0], 10);
                        pCell = from.slice(1);
                    }
                    // if you have no more pieces, passing is your only option
                    if (smallest === undefined) {
                        newmove = "pass";
                    // if you're clicking on the same space, increment the piece size
                    } else if (cell === pCell) {
                        let next: number = pSize + 1;
                        if (next > 3) { next = 1;}
                        // not an infinite loop because there must at least be one `pSize` piece to have gotten this far
                        while ( (stash[next - 1] === 0) || (! this.validPlacement(pCell, next as Piece, this.currplayer)) ) {
                            next++;
                            if (next > 3) { next = 1;}
                        }
                        if (from.length !== 2) {
                            newmove = `${next}${pCell}`;
                        } else {
                            newmove = `${from}-${to},${next}${pCell}`;
                        }
                    // user entered size to place
                    } else if (pCell === "") {
                        if (from.length !== 2) {
                            newmove = `${pSize}${cell}`;
                        } else {
                            newmove = `${from}-${to},${pSize}${cell}`;
                        }
                    // if you're clicking on a valid empty cell, replace it, starting with the smallest piece
                    } else {
                        const g = this.clone();
                        g.board.set(to, this.board.get(from)!)
                        g.board.delete(from);
                        if (g.findPoints().includes(place)) {
                            newmove = `${from}-${to},${smallest}${cell}`;
                        // otherwise, change nothing
                        } else {
                            newmove = move;
                        }
                    }
                } else if (to !== undefined) {
                    const g = this.clone();
                    g.board.set(to, this.board.get(from)!)
                    g.board.delete(from);
                    // if you have no more pieces, passing is your only option
                    if (smallest === undefined) {
                        newmove = "pass";
                    // if to is defined and you're clicking on a valid cell, assume placement
                    } else if (g.findPoints().includes(cell)) {
                        newmove = `${from}-${to},${smallest}${cell}`;
                    // otherwise, assume you want to move the worker again
                    } else {
                        newmove = `${from}-${cell}`;
                    }
                } else { // from *has* to be defined if move itself has content
                    if (smallest === undefined) {
                        newmove = "pass";
                    // if you click on an empty cell, assume movement
                    } else if ( (this.board.has(from)) && (! this.board.has(cell)) ) {
                        newmove = `${from}-${cell}`;
                    } else if (! this.board.has(from)) {
                        newmove = `${smallest}${cell}`;
                    } else {
                        newmove = move;
                    }
                }
            }
            const result = this.validateMove(newmove) as IClickResult;
            if (! result.valid) {
                result.move = move;
            } else {
                result.move = newmove;
            }
            return result;
        } catch (e) {
            return {
                move,
                valid: false,
                message: i18next.t("apgames:validation._general.GENERIC", {move, row, col, piece, emessage: (e as Error).message, estack: (e as Error).stack})
            }
        }
    }

    public validateMove(m: string): IValidationResult {
        const result: IValidationResult = {valid: false, message: i18next.t("apgames:validation._general.DEFAULT_HANDLER")};
        m = m.toLowerCase();
        m = m.replace(/\s+/g, "");
        if (m.length > 0 && m.match(/^(pass|[a-i]([1-9](-([a-i]([1-9](,([123]([a-i]([1-9])?)?)?)?)?)?)?)?|,?([123]([a-i]([1-9])?)?)?)$/) == null) {
            result.valid = false;
            result.message = i18next.t("apgames:validation._general.INVALID_MOVE", {move: m});
            return result;
        }
        if (m.length > 0 && m.match(/^(pass|[a-i][1-9](-[a-i][1-9](,[123]([a-i][1-9])?)?)?|,?([123]([a-i][1-9])?))$/) == null) {
            result.valid = true;
            result.complete = -1;
            result.message = i18next.t("apgames:validation._general.INCOMPLETE_MOVE");
            return result;
        }
        if (m.length === 0) {
            result.valid = true;
            result.complete = -1;
            if (this.board.size < 2) {
                result.message = i18next.t("apgames:validation.urbino.INITIAL_INSTRUCTIONS", {context: "fresh"});
            } else if (this.board.size === 2) {
                result.message = i18next.t("apgames:validation.urbino.INITIAL_INSTRUCTIONS", {context: "first"});
            } else {
                result.message = i18next.t("apgames:validation.urbino.INITIAL_INSTRUCTIONS", {context: "inprogress"});
            }
            return result;
        }

        // validate "pass" first of all
        if (m === "pass") {
            if (! this.moves().includes("pass")) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.urbino.INVALID_PASS");
                return result;
            }
            result.valid = true;
            result.complete = 1;
            result.message = i18next.t("apgames:validation._general.VALID_MOVE");
            return result;
        }

        let [from, to, place] = m.split(/[-,]/);
        let moved = true;
        if (place === undefined && m.includes(',')){ // this happens when user clicks on stash (without movement)
            place = to;
            to = '';
            moved = false;
        } else if (from.length !== 2) {
            place = from;
            from = '';
            moved = false;
        }

        if (moved) {
            if ( (from !== undefined) && (from.length === 2) ) {
                // valid cell
                try {
                    RealmGame.algebraic2coords(from);
                } catch {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.INVALIDCELL", {cell: from});
                    return result;
                }
                // from currently contains a worker you control
                if (! this.board.has(from)) {
                    if (this.board.size < 2) {
                        result.valid = true;
                        result.complete = 1;
                        result.message = i18next.t("apgames:validation._general.VALID_MOVE");
                        return result;
                    }

                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.NONEXISTENT", {where: from});
                    return result;
                }
                // First move after placing workers has to be a placement or pass
                if (this.board.size === 2) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.urbino.MUST_PASS_PLAY");
                    return result;
                }

                if (this.board.get(from)![0] !== 0) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.UNCONTROLLED");
                    return result;
                }

                // if this is it, then this is a valid partial
                if (to === undefined) {
                    result.valid = true;
                    result.complete = -1;
                    result.message = i18next.t("apgames:validation.urbino.PARTIAL_MOVE");
                    return result;
                }
            }

            if (to !== undefined) {
                // valid cell
                try {
                    RealmGame.algebraic2coords(to);
                } catch {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.INVALIDCELL", {cell: to});
                    return result;
                }
                // to is empty
                if (this.board.has(to)) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.OCCUPIED", {where: to});
                    return result;
                }
                // there are valid placements from here
                const g = this.clone();
                g.board.set(to, this.board.get(from)!);
                g.board.delete(from);
                if (! g.anyValidPlacement()) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.urbino.NOPLACEMENTS");
                    return result;
                }
                // If this is it, this is a valid partial
                if (place === undefined) {
                    result.valid = true;
                    result.complete = -1;
                    result.canrender = true;
                    result.message = i18next.t("apgames:validation.urbino.PARTIAL_PLACE_SIZE");
                    return result;
                }
            }
        }

        if ( place !== undefined ) {
            const pSize = parseInt(place[0], 10) as Piece;
            const pCell = place.slice(1);
            if (pCell === "") {
                result.valid = true;
                result.complete = -1;
                result.message = i18next.t("apgames:validation.urbino.PARTIAL_PLACE");
                return result;
            }
            const g = this.clone();
            if (moved) {
                g.board.set(to, this.board.get(from)!);
                g.board.delete(from);
            }
            const points = g.findPoints();
            // valid cell
            try {
                RealmGame.algebraic2coords(pCell);
            } catch {
                result.valid = false;
                result.message = i18next.t("apgames:validation._general.INVALIDCELL", {cell: pCell});
                return result;
            }
            // This cell exists in the list of possible points
            if (! points.includes(pCell)) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.urbino.INVALID_PLACE_CELL", {where: pCell});
                return result;
            }
            // This piece can legally go here
            if (! g.validPlacement(pCell, pSize, this.currplayer)) {
                result.valid = false;
                switch (pSize) {
                    case 1:
                        result.message = i18next.t("apgames:validation.urbino.INVALID_PLACE_PIECE.house", {where: pCell});
                        break;
                    case 2:
                        result.message = i18next.t("apgames:validation.urbino.INVALID_PLACE_PIECE.tower", {where: pCell});
                        break;
                    case 3:
                        result.message = i18next.t("apgames:validation.urbino.INVALID_PLACE_PIECE.palace", {where: pCell});
                        break;
                }
                return result;
            }

            // we're good
            result.valid = true;
            result.complete = 1;
            result.message = i18next.t("apgames:validation._general.VALID_MOVE");
            return result;
        }

        return result;
    }

    // The partial flag enabled dynamic connection checking.
    // It leaves the object in an invalid state, so only use it on cloned objects, or call `load()` before submitting again.
    public move(m: string, partial = false): RealmGame {
        if (this.gameover) {
            throw new UserFacingError("MOVES_GAMEOVER", i18next.t("apgames:MOVES_GAMEOVER"));
        }

        m = m.toLowerCase();
        m = m.replace(/\s+/g, "");
        const result = this.validateMove(m);
        if (! result.valid) {
            throw new UserFacingError("VALIDATION_GENERAL", result.message)
        }
        this.results = [];

        if (this.phase === "initialBase") {
            const reMove = /^b[a-l]\d+$/;
            if (! reMove.test(m)) {
                throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
            }
            const cell = m.substring(1);
            this.board.set(cell, [this.currplayer, "B", undefined]);
            this.pieces[this.currplayer - 1][0]--;
            this.results.push({type: "place", what: "base", where: cell});
            // Next phase if number of pieces is twice the number of initial powers
            if ([...this.board.keys()].length === this.pieces[this.currplayer - 1][1] * 2) {
                this.phase = "initialPower";
            }
        } else if (this.phase === "initialPower") {
            const reMove = /^p[a-l]\d+$/;
            if (! reMove.test(m)) {
                throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
            }
            const cell = m.substring(1);
            this.board.set(cell, [this.currplayer, "P", undefined]);
            this.pieces[this.currplayer - 1][1]--;
            this.results.push({type: "place", what: "power", where: cell});
            // Next phase if all powers have been placed
            if (this.pieces[0][1] + this.pieces[1][1] === 0) {
                this.phase = "play";
            }
        } else {
            // If move starts with a hyphen, it's a rearrangement
            if (m.startsWith("-")) {
                const parts = m.split(",");
                const realm = parts.shift()!;
                const border = this.getBorderCells(realm);
                const inhand: string[] = [];
                for (const cell of border) {
                    if (this.board.has(cell)) {
                        const contents = this.board.get(cell)!;
                        if ( (contents[0] === this.currplayer) || (this.variants.includes("control")) ) {
                            const cstr = `${contents[1]}${contents[0]}`;
                            inhand.push(cstr);
                            this.results.push({type: "take", what: cstr, from: cell});
                            this.board.delete(cell);
                        }
                    }
                }
                const rePart = /^([ex|e|p|b])([1|2])([a-l]\d+)([N|E|S|W]?)$/;
                for (const part of parts) {
                    const p = part.match(rePart);
                    if (p !== null) {
                        const [, piece, owner, dest, dir] = p;
                        const pcstr = piece[0].toUpperCase() + piece.substring(1) + owner;
                        if (! inhand.includes(pcstr)) {
                            throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                        }
                        const idx = inhand.findIndex(x => x === pcstr);
                        inhand.splice(idx, 1);
                        this.board.set(dest, [parseInt(owner, 10) as playerid, (piece[0].toUpperCase() + piece.substring(1)) as Piece, dir as Facing]);
                        this.results.push({type: "place", what: pcstr, where: dest});
                    } else {
                        throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                    }
                }
                if (inhand.length > 0) {
                    throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                }
            // Otherwise simply movement and special events
            } else {
                // Moves must be separated by semicolons because special actions can contain commas
                const parts = m.split(";");
                const rePart = /^([p|e])([a-l]\d+)([a-l]\d+)(\((.*?)\))?$/;
                for (const part of parts) {
                    const p = part.match(rePart);
                    if (p !== null) {
                        const [, piece, from, to,, special] = p;
                        // if enforcer, get new facing
                        let newfacing: Facing;
                        if (piece === "e") {
                            newfacing = RealmGame.newFacing(from, to);
                        }
                        this.board.delete(from);
                        this.board.set(to, [this.currplayer, piece.toUpperCase() as Piece, newfacing]);
                        this.results.push({type: "move", from, to});
                        if (special !== undefined) {
                            const reCap = /^x([e|b])([a-l]\d+)$/;
                            const reCreate = /^([e|b])([a-l]\d+)([N|E|S|W])?$/;
                            const specials = special.split(",");
                            for (const s of specials) {
                                if (reCap.test(s)) {
                                    const cap = s.match(reCap);
                                    if (cap !== null) {
                                        const [, pc, cell] = cap;
                                        if (pc === "b") {
                                            this.board.delete(cell);
                                            this.captured[this.currplayer - 1]++;
                                            this.results.push({type: "capture", what: "base", where: cell});
                                            if (this.variants.includes("replacement")) {
                                                if (this.pieces[this.currplayer - 1][0] > 0) {
                                                    this.pieces[this.currplayer - 1][0]--;
                                                    this.board.set(cell, [this.currplayer, "B", undefined]);
                                                    this.results.push({type: "place", what: "base", where: cell});
                                                }
                                            }
                                        } else {
                                            if (this.board.has(cell)) {
                                                this.board.get(cell)![1] = "Ex";
                                                this.results.push({type: "immobilize", where: cell});
                                            } else {
                                                throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                                            }
                                        }
                                    } else {
                                        throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                                    }
                                } else if (reCreate.test(s)) {
                                    const create = s.match(reCreate);
                                    if (create !== null) {
                                        const [, pc, cell, facing] = create;
                                        this.board.set(cell, [this.currplayer, pc.toUpperCase() as Piece, facing as Facing]);
                                        if (pc === "b") {
                                            this.pieces[this.currplayer - 1][0]--;
                                            this.results.push({type: "place", what: "base", where: cell});
                                        } else {
                                            this.pieces[this.currplayer - 1][2]--;
                                            this.results.push({type: "place", what: "enforcer", where: cell});
                                        }
                                    } else {
                                        throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                                    }
                                } else {
                                    throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                                }
                            }
                        }
                    } else {
                        throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}));
                    }
                }
            }
        }

        // Stop here if only requesting partial processing
        if (partial) { return this; }

        // update currplayer
        this.lastmove = m;
        let newplayer = (this.currplayer as number) + 1;
        if (newplayer > this.numplayers) {
            newplayer = 1;
        }
        this.currplayer = newplayer as playerid;

        this.checkEOG();
        this.saveState();
        return this;
    }

    private getBorderCells(ctr: string): string[] {
        const ctrs = [1, 4, 7, 10];
        const [cx, cy] = RealmGame.algebraic2coords(ctr);
        if ( (! ctrs.includes(cx)) || (! ctrs.includes(cy)) ) {
            throw new Error(`${ctr} is not a centre space`);
        }
        const cells: string[] = [];
        for (const dx of [-1, 0, 1]) {
            for (const dy of [-1, 0, 1]) {
                const border = RealmGame.coords2algebraic(cx + dx, cy + dy);
                if (border !== ctr) {
                    cells.push(border);
                }
            }
        }
        return cells;
    }

    protected checkEOG(): RealmGame {
        // Game ends if one player has no bases left
        if ( (this.pieces[0][0] === 0) || (this.pieces[1][0] === 0) ) {
            this.gameover = true;
            const score1 = this.getPlayerScore(1)!;
            const score2 = this.getPlayerScore(2)!;
            if (score1 > score2) {
                this.winner = [1]
            } else if (score1 < score2) {
                this.winner = [2];
            } else {
                this.winner = [1,2];
            }
        }
        if (this.gameover) {
            this.results.push(
                {type: "eog"},
                {type: "winners", players: [...this.winner]}
            );
        }
        return this;
    }

    public getPlayerScore(player: playerid): number {
        let score = 0;

        // count controlled realms
        score += [...this.board.values()].filter(c => c[0] === player && c[1] === "B").length;

        // count mobile and uncreated enforcers (/10)
        const count = this.pieces[player - 1][2] + [...this.board.values()].filter(c => c[0] === player && c[1] === "E").length;
        score += count / 10;

        // if variant given, count captured bases (/100)
        // ONLY COUNTS FIRST 9 CAPTURED BASES!
        if (this.variants.includes("capturedBases")) {
            score += Math.min(9, this.captured[player - 1]) / 100;
        }

        return score;
    }

    public state(): IRealmState {
        return {
            game: RealmGame.gameinfo.uid,
            numplayers: this.numplayers,
            variants: [...this.variants],
            gameover: this.gameover,
            winner: [...this.winner],
            stack: [...this.stack]
        };
    }

    public moveState(): IMoveState {
        return {
            _version: RealmGame.gameinfo.version,
            _results: [...this.results],
            _timestamp: new Date(),
            currplayer: this.currplayer,
            lastmove: this.lastmove,
            board: new Map(this.board),
            pieces: deepclone(this.pieces) as [[number,number,number],[number,number,number]],
            phase: this.phase,
            captured: deepclone(this.captured) as [number,number],
        };
    }

    public render(): APRenderRep {
        // Build piece string
        let pstr = "";
        for (let row = 0; row < 12; row++) {
            if (pstr.length > 0) {
                pstr += "\n";
            }
            const pieces: string[] = [];
            for (let col = 0; col < 12; col++) {
                const cell = RealmGame.coords2algebraic(col, row);
                if (this.board.has(cell)) {
                    const contents = this.board.get(cell);
                    if (contents === undefined) {
                        throw new Error("Malformed cell contents.");
                    }
                    let colour = "R";
                    if (contents[0] === 2) {
                        colour = "B";
                    }
                    let piece = contents[1] + colour;
                    if (contents[2] !== undefined) {
                        piece += contents[2];
                    }
                    pieces.push(piece);
                } else {
                    pieces.push("");
                }
            }
            pstr += pieces.join(",");
        }
        pstr = pstr.replace(/\n,{11}(?=\n)/g, "\n_");

        // build markers
        const markers: {row: number; col: number}[] = [];
        const ctrs = [1, 4, 7, 10];
        for (const x of ctrs) {
            for (const y of ctrs) {
                markers.push({col: x, row: y});
            }
        }


        // Build rep
        const rep: APRenderRep =  {
            board: {
                style: "squares",
                width: 12,
                height: 12,
                tileHeight: 3,
                tileWidth: 3,
                markers: [{
                    "type": "glyph",
                    "glyph": "circle",
                    "points": markers
                }],
            },
            legend: {
                circle: {
                    name: "piece"
                },
                BR: {
                    name: "piece-square",
                    player: 1
                },
                BB: {
                    name: "piece-square",
                    player: 2
                },
                PR: {
                    name: "piece",
                    player: 1
                },
                PB: {
                    name: "piece",
                    player: 2
                },
                ER: {
                    name: "piece-triangle",
                    player: 1
                },
                EB: {
                    name: "piece-triangle",
                    player: 2
                },
                ExR: {
                    name: "piece-triangle-dot",
                    player: 1,
                    opacity: 0.5
                },
                ExB: {
                    name: "piece-triangle-dot",
                    player: 2,
                    opacity: 0.5
                },
            },
            pieces: pstr
        };

        // Add annotations
        // if (this.stack[this.stack.length - 1]._results.length > 0) {
        if (this.results.length > 0) {
            // @ts-ignore
            rep.annotations = [];
            // for (const move of this.stack[this.stack.length - 1]._results) {
            for (const move of this.results) {
                if (move.type === "move") {
                    const [fromX, fromY] = RealmGame.algebraic2coords(move.from);
                    const [toX, toY] = RealmGame.algebraic2coords(move.to);
                    rep.annotations.push({type: "move", player: 3, targets: [{row: fromY, col: fromX}, {row: toY, col: toX}]});
                } else if (move.type === "place") {
                    const [x, y] = RealmGame.algebraic2coords(move.where!);
                    rep.annotations.push({type: "enter", targets: [{row: y, col: x}]});
                } else if ( (move.type === "capture") || (move.type === "immobilize") ) {
                    const [x, y] = RealmGame.algebraic2coords(move.where!);
                    rep.annotations.push({type: "exit", targets: [{row: y, col: x}]});
                }
            }
            if (rep.annotations.length === 0) {
                delete rep.annotations;
            }
        }

        return rep;
    }

    public status(): string {
        let status = super.status();

        if (this.variants !== undefined) {
            status += "**Variants**: " + this.variants.join(", ") + "\n\n";
        }

        status += "**Stashes**\n\n";
        for (let n = 1; n <= this.numplayers; n++) {
            const stash = this.pieces[n - 1];
            if (stash === undefined) {
                throw new Error("Malformed stash.");
            }
            status += `Player ${n}: ${stash[0]} bases, ${stash[1]} powers, ${stash[2]} enforcers\n\n`;
        }

        status += "**Scores**\n\n";
        for (let n = 1; n <= this.numplayers; n++) {
            status += `Player ${n}: ${this.getPlayerScore(n as playerid)}\n\n`;
        }

        return status;
    }

    public getPlayersScores(): IScores[] {
        return [{ name: i18next.t("apgames:status.SCORES"), scores: [this.getPlayerScore(1), this.getPlayerScore(2)] }]
    }

    protected getMoveList(): any[] {
        return this.getMovesAndResults(["move", "capture"]);
    }

    // public chat(node: string[], name: string, results: APMoveResult[], r: APMoveResult): boolean {
    //     let resolved = false;
    //     switch (r.type) {
    //         case "place":
    //             switch (r.what) {
    //                 case "0":
    //                     node.push(i18next.t("apresults:PLACE.urbino.worker", {player: name, where: r.where}));
    //                     break;
    //                 case "1":
    //                     node.push(i18next.t("apresults:PLACE.urbino.house", {player: name, where: r.where}));
    //                     break;
    //                 case "2":
    //                     node.push(i18next.t("apresults:PLACE.urbino.palace", {player: name, where: r.where}));
    //                     break;
    //                 case "3":
    //                     node.push(i18next.t("apresults:PLACE.urbino.tower", {player: name, where: r.where}));
    //                     break;
    //             }
    //             resolved = true;
    //             break;
    //     }
    //     return resolved;
    // }

    public getPlayerStash(player: number): IStashEntry[] | undefined {
        const stash = this.pieces[player - 1];
        if (stash !== undefined) {
            return [
                {count: stash[0], glyph: { name: "piece-square",  player }, movePart: ",1"},
                {count: stash[1], glyph: { name: "piece", player }, movePart: ",2"},
                {count: stash[2], glyph: { name: "piece-triangle",  player }, movePart: ",3"}
            ];
        }
        return;
    }

    public clone(): RealmGame {
        return new RealmGame(this.serialize());
    }
}

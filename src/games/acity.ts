/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-var-requires */
import { GameBase, IAPGameState, IClickResult, IIndividualState, IScores, IValidationResult } from "./_base";
import { APGamesInformation } from "../schemas/gameinfo";
import { APRenderRep } from "@abstractplay/renderer/src/schemas/schema";
import { APMoveResult } from "../schemas/moveresults";
import { Directions, RectGrid, reviver, UserFacingError, shuffle } from "../common";
import i18next from "i18next";
import { SquareOrthGraph } from "../common/graphs";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const deepclone = require("rfdc/default");

export type playerid = 1|2;

type Piece = "RT"|"RD"|"BT"|"BD"|"GT"|"GD"|"ND";
type Color = "R"|"B"|"G"|"N";
type MarkerPos = 0|1|2|3;

export interface IMoveState extends IIndividualState {
    currplayer: playerid;
    board: Map<string, Piece>;
    lastmove?: string;
    stashes: [Piece[],Piece[]];
    claimed: [string[],string[]];
};

export interface IACityState extends IAPGameState {
    winner: playerid[];
    stack: Array<IMoveState>;
    startpos: [Color,MarkerPos][]
};

interface ITile {
    guild: Color;
    marker: string;
    cells: string[];
}

export class ACityGame extends GameBase {
    public static readonly gameinfo: APGamesInformation = {
        name: "Alien City",
        uid: "acity",
        playercounts: [2],
        version: "20230531",
        // i18next.t("apgames:descriptions.acity")
        description: "apgames:descriptions.acity",
        urls: ["http://www.piecepack.org/rules/AlienCity.pdf", "https://boardgamegeek.com/boardgame/20623/alien-city"],
        people: [
            {
                type: "designer",
                name: "Michael Schoessow",
            }
        ],
        flags: ["player-stashes", "scores", "automove", "multistep", "automove", "experimental"]
    };

    public numplayers = 2;
    public currplayer: playerid = 1;
    public board!: Map<string, Piece>;
    public stashes!: [Piece[],Piece[]];
    public graph!: SquareOrthGraph;
    public gameover = false;
    public winner: playerid[] = [];
    public variants: string[] = [];
    public stack!: Array<IMoveState>;
    public results: Array<APMoveResult> = [];
    public startpos!: [Color,MarkerPos][];
    public claimed!: [string[],string[]];

    constructor(state?: IACityState | string) {
        super();
        if (state === undefined) {
            const fresh: IMoveState = {
                _version: ACityGame.gameinfo.version,
                _results: [],
                _timestamp: new Date(),
                currplayer: 1,
                board: new Map(),
                stashes: [
                    ["RD","RD","RD","BD","BD","BD","GD","GD","GD","ND","ND","ND","RT","RT","RT","BT","BT","GT","GT"],
                    ["RD","RD","RD","BD","BD","BD","GD","GD","GD","ND","ND","ND","RT","RT","BT","BT","BT","GT","GT"],
                ],
                claimed: [[],[]]
            };
            this.stack = [fresh];
            this.startpos = [];
            for (const colour of shuffle("NNNNNRRRRRGGGGGBBBBB".split(""))) {
                const cell = Math.floor(Math.random() * 4);
                this.startpos.push([colour as Color, cell as MarkerPos]);
            }
        } else {
            if (typeof state === "string") {
                state = JSON.parse(state, reviver) as IACityState;
            }
            if (state.game !== ACityGame.gameinfo.uid) {
                throw new Error(`The Alien City engine cannot process a game of '${state.game}'.`);
            }
            this.gameover = state.gameover;
            this.winner = [...state.winner];
            this.variants = state.variants;
            this.stack = [...state.stack];
            this.startpos = deepclone(state.startpos) as [Color,MarkerPos][];
        }
        this.load();
    }

    public load(idx = -1): ACityGame {
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
        this.results = [...state._results];
        this.stashes = deepclone(state.stashes) as [Piece[],Piece[]];
        this.claimed = deepclone(state.claimed) as [string[],string[]];
        this.buildGraph();
        return this;
    }

    private buildGraph(): ACityGame {
        this.graph = new SquareOrthGraph(8, 10);
        // for each cell that has pieces
        for (const cell of this.board.keys()) {
            // look at each neighboring cell
            for (const n of this.graph.neighbours(cell)) {
                // if that cell also has a piece
                if (this.board.has(n)) {
                    // remove the direct connection between them
                    // you can only connect along the road
                    this.graph.graph.dropEdge(cell, n);
                }
            }
        }
        return this;
    }

    public moves(player?: playerid): string[] {
        if (this.gameover) { return []; }
        if (player === undefined) {
            player = this.currplayer;
        }

        const moves: string[] = [];

        const stash = new Set<string>(...this.stashes[player - 1]);
        const empties = (this.graph.listCells() as string[]).filter(c => ! this.board.has(c));
        for (const piece of stash) {
            for (const cell of empties) {
                const move = `${piece}-${cell}`
                const result = this.validateMove(move);
                if ( (result.valid) && (result.complete !== undefined) && (result.complete >= 0) ) {
                    moves.push(move);
                }
            }
        }

        if (this.claimed[player - 1].length < 3) {
            const unclaimed = [...this.board.entries()].filter(node => ( (node[1].endsWith("T")) && (! this.claimed[0].includes(node[0])) && (! this.claimed[1].includes(node[0])) )).map(node => node[0]);
            const caps: string[] = [];
            for (const move of moves)  {
                for (const cell of unclaimed) {
                    caps.push(`${move}(${cell})`);
                }
            }
            moves.push(...caps);
        }

        if (moves.length === 0) {
            moves.push("pass");
        }

        return moves;
    }

    public randomMove(): string {
        const moves = this.moves();
        return moves[Math.floor(Math.random() * moves.length)];
    }

    public cell2guild(cell: string): [Color, boolean] {
        const [x, y] = this.graph.algebraic2coords(cell);
        const tileX = Math.floor(x / 2);
        const tileY = Math.floor(y / 2);
        const idx = (tileY * 4) + tileX;
        const tile = this.startpos[idx];
        const guild = tile[0];
        let markerX = tileX * 2;
        let markerY = tileY * 2;
        switch (tile[1]) {
            case 1:
                markerX++;
                break;
            case 2:
                markerY++;
                break;
            case 3:
                markerX++;
                markerY++;
                break;
        }
        const isMarker = ( (markerX === x) && (markerY === y) );
        return [guild, isMarker];
    }

    public cell2tile(cell: string): ITile {
        const [x, y] = this.graph.algebraic2coords(cell);
        const tileX = Math.floor(x / 2);
        const tileY = Math.floor(y / 2);
        const idx = (tileY * 4) + tileX;
        const tile = this.startpos[idx];
        const guild = tile[0];
        let markerX = tileX * 2;
        let markerY = tileY * 2;
        switch (tile[1]) {
            case 1:
                markerX++;
                break;
            case 2:
                markerY++;
                break;
            case 3:
                markerX++;
                markerY++;
                break;
        }
        const result: ITile = {
            guild,
            cells: [],
            marker: this.graph.coords2algebraic(markerX, markerY),
        };
        for (let dx = 0; dx <= 1; dx++) {
            for (let dy = 0; dy <= 1; dy++) {
                result.cells.push(this.graph.coords2algebraic((tileX * 2) + dx, (tileY * 2) + dy));
            }
        }
        return result;
    }

    public handleClick(move: string, row: number, col: number, piece?: string): IClickResult {
        const reMove = /^([RGBN][DT])(\-([a-h]\d+))?(\(([a-h]\d+)\))?$/;
        try {
            const cell = this.graph.coords2algebraic(col, row);
            const openArea = this.getAreas().open[0];
            let newmove = "";
            if (move === "") {
                // clicking on an empty space must be a placement
                if (! this.board.has(cell)) {
                    // must be in the open area
                    if (openArea.has(cell)) {
                        newmove = cell;
                    } else {
                        // otherwise do nothing
                        return {move: "", message: ""} as IClickResult;
                    }
                // otherwise it must be a move
                } else {
                    if ( (this.board.get(cell)! === this.currplayer) && (openArea.has(cell)) ) {
                        newmove = cell;
                    } else {
                        // otherwise do nothing
                        return {move: "", message: ""} as IClickResult;
                    }
                }
            } else {
                // Already moved; need to place fence
                if (move.includes("-")) {
                    // assume bearing of cell they clicked on relative to target
                    const [from, target] = move.split("-");
                    let to = target;
                    if (/[NESW]$/.test(to)) {
                        to = to.slice(0, to.length - 1);
                    }
                    const bearing = this.graph.bearing(to, cell);
                    if (bearing !== undefined) {
                        // bearing = bearing.toString().slice(0, 1) as Directions;
                        if (from === to) {
                            newmove = `${to}${bearing}`;
                        } else {
                            newmove = `${from}-${to}${bearing}`;
                        }
                    } else {
                        newmove = `${from}-${to}`;
                    }
                // otherwise looking for destination
                } else {
                    // Only checking that destination is empty and in open area
                    if ( ( (! this.board.has(cell)) && (openArea.has(cell)) ) || (move === cell) ) {
                        newmove = `${move}-${cell}`;
                    } else {
                        newmove = move;
                    }
                }
            }
            const result = this.validateMove(newmove) as IClickResult;
            if (! result.valid) {
                result.move = "";
            } else {
                result.move = newmove;
            }
            return result;
        } catch (e) {
            return {
                move,
                valid: false,
                message: i18next.t("apgames:validation._general.GENERIC", {move, row, col, piece, emessage: (e as Error).message})
            }
        }
    }

    public validateMove(m: string): IValidationResult {
        const result: IValidationResult = {valid: false, message: i18next.t("apgames:validation._general.DEFAULT_HANDLER")};

        if (m.length === 0) {
            result.valid = true;
            result.complete = -1;
            result.message = i18next.t("apgames:validation.fendo.INITIAL_INSTRUCTIONS");
            return result;
        }

        if (m === "pass") {
            if (this.moves().includes("pass")) {
                result.valid = true;
                result.complete = 1;
                result.message = i18next.t("apgames:validation._general.VALID_MOVE");
                return result;
            } else {
                result.valid = false;
                result.message = i18next.t("apgames:validation.fendo.INVALID_PASS");
                return result;
            }
        }

        if ( (m.length === 3) && (/[NESW]$/.test(m)) ) {
            const cell = m.substring(0, 2);
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const dir = m[2] as Directions;
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const allcells = this.graph.listCells(false) as string[];

            // cell is valid
            if (! allcells.includes(cell)) {
                result.valid = false;
                result.message = i18next.t("apgames:validation._general.INVALIDCELL", {cell});
                return result;
            }
            // `dir` is valid value
            if (! ["N", "E", "S", "W"].includes(dir)) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.fendo.INVALID_DIRECTION", {dir});
                return result;
            }
            // fence is between two cells
            const grid = new RectGrid(7, 7);
            const [x, y] = this.graph.algebraic2coords(cell);
            const ray = grid.ray(x, y, dir).map(pt => this.graph.coords2algebraic(...pt));
            if (ray.length === 0) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.fendo.NO_EDGE_FENCES");
                return result;
            }
            // fence doesn't already exist
            const next = ray[0];
            const fence = this.fences.find(pair => pair.includes(cell) && pair.includes(next));
            if (fence !== undefined) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.fendo.DUPLICATE_FENCE");
                return result;
            }
            // placing the fence doesn't violate any rules
            // Make the move, set the fence, and test that the result is valid
            const cloned: ACityGame = Object.assign(new ACityGame(), deepclone(this) as ACityGame);
            cloned.buildGraph();
            cloned.graph.graph.dropEdge(cell, next);
            const clonedAreas = cloned.getAreas();
            if ( (clonedAreas.empty.length > 0) || (clonedAreas.open.length > 1) ) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.fendo.INVALID_FENCE");
                return result;
            }

            // valid move
            result.valid = true;
            result.complete = 1;
            result.message = i18next.t("apgames:validation._general.VALID_MOVE");
            return result;
        }

        const [from, target] = m.split("-");
        let to = target;
        let dir: Directions | undefined;
        if (/[NESW]$/.test(m)) {
            to = target.slice(0, target.length - 1);
            dir = target.slice(target.length - 1) as Directions;
        }
        const allcells = this.graph.listCells(false) as string[];

        if (from !== undefined) {
            const areas = this.getAreas();
            const open = areas.open[0];
            const allTargets = this.genTargets(this.currplayer, open);
            const uniqueTargets = new Set([...allTargets.values()].flat(1));
            // cell is valid
            if (! allcells.includes(from)) {
                result.valid = false;
                result.message = i18next.t("apgames:validation._general.INVALIDCELL", {cell: from});
                return result;
            }

            // if cell is empty, assume placement
            if (! this.board.has(from)) {
                // if `to` is defined, then we have a problem
                if (to !== undefined) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.NONEXISTENT", {where: from});
                    return result;
                }
                // in the open area
                if (! open.has(from)) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.fendo.PLACE_IN_OPEN");
                    return result;
                }
                // placement in range
                if (! uniqueTargets.has(from)) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.fendo.PLACE_IN_RANGE");
                    return result;
                }
                // The player has pieces to place
                if (this.pieces[this.currplayer - 1] === 0) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.NOPIECES");
                    return result;
                }

                // we're good
                result.valid = true;
                result.complete = 1;
                result.message = i18next.t("apgames:validation._general.VALID_MOVE");
                return result;

            // otherwise, it has to be movement
            } else {
                // in the open area
                if (! open.has(from)) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.fendo.ONLY_MOVE_OPEN");
                    return result;
                }
                if (to !== undefined) {
                    // target is valid
                    const targets = allTargets.get(from);
                    if ( (from !== to) && ( (targets === undefined) || (! targets.includes(to)) ) ) {
                        result.valid = false;
                        result.message = i18next.t("apgames:validation.fendo.INVALID_DESTINATION", {from, to});
                        return result;
                    }
                    if (dir !== undefined) {
                        // `dir` is valid value
                        if (! ["N", "E", "S", "W"].includes(dir)) {
                            result.valid = false;
                            result.message = i18next.t("apgames:validation.fendo.INVALID_DIRECTION", {dir});
                            return result;
                        }
                        // fence is between two cells
                        const grid = new RectGrid(7, 7);
                        const [x, y] = this.graph.algebraic2coords(to);
                        const ray = grid.ray(x, y, dir).map(pt => this.graph.coords2algebraic(...pt));
                        if (ray.length === 0) {
                            result.valid = false;
                            result.message = i18next.t("apgames:validation.fendo.NO_EDGE_FENCES");
                            return result;
                        }
                        // fence doesn't already exist
                        const next = ray[0];
                        const fence = this.fences.find(pair => pair.includes(to) && pair.includes(next));
                        if (fence !== undefined) {
                            result.valid = false;
                            result.message = i18next.t("apgames:validation.fendo.DUPLICATE_FENCE");
                            return result;
                        }
                        // placing the fence doesn't violate any rules
                        // Make the move, set the fence, and test that the result is valid
                        const cloned: ACityGame = Object.assign(new ACityGame(), deepclone(this) as ACityGame);
                        cloned.buildGraph();
                        cloned.board.delete(from);
                        cloned.board.set(to, this.currplayer);
                        cloned.graph.graph.dropEdge(to, next);
                        const clonedAreas = cloned.getAreas();
                        if ( (clonedAreas.empty.length > 0) || (clonedAreas.open.length > 1) ) {
                            result.valid = false;
                            result.message = i18next.t("apgames:validation.fendo.INVALID_FENCE");
                            return result;
                        }

                        // valid move
                        result.valid = true;
                        result.complete = 1;
                        result.message = i18next.t("apgames:validation._general.VALID_MOVE");
                        return result;
                    } else {
                        // good enough for a partial success
                        result.valid = true;
                        result.complete = -1;
                        result.canrender = true;
                        result.message = i18next.t("apgames:validation.fendo.PARTIAL_FENCE");
                        return result;
                    }
                } else {
                    // good enough for a partial success
                    result.valid = true;
                    result.complete = -1;
                    result.message = i18next.t("apgames:validation.fendo.PARTIAL_MOVE");
                    return result;
                }
            }
        }

        return result;
    }

    public move(m: string, partial = false): ACityGame {
        if (this.gameover) {
            throw new UserFacingError("MOVES_GAMEOVER", i18next.t("apgames:MOVES_GAMEOVER"));
        }
        m = m.toLowerCase();
        m = m.replace(/\s+/g, "");
        if (m !== "pass") {
            m = m.replace(/[a-z]+$/, (match) => {return match.toUpperCase();});
        }
        const result = this.validateMove(m);
        if (! result.valid) {
            throw new UserFacingError("VALIDATION_GENERAL", result.message)
        }
        if ( (! partial) && (! this.moves().includes(m)) ) {
            throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}))
        }
        /*
        // this doesn't work, because sometimes the move is legal, but there are no available fence placements. We want to show the
        // move so that you can get reasons for each fence placement being impossible.
        else if ( (partial) && (this.moves().filter(x => x.startsWith(m)).length < 1) ) {
            throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}))
        }
        */
        this.results = [];
        // Always check for a pass
        if (m === "pass") {
            this.results.push({type: "pass"});
        // Now look for movement
        } else if (m.includes("-")) {
            const [from, target] = m.split("-");
            let to = target;
            let dir: Directions | undefined;
            if (/[NESW]$/.test(target)) {
                to = target.slice(0, target.length - 1);
                dir = target[target.length - 1] as Directions;
            }
            let path = this.naivePath(from, to);
            if (path === null) {
                path = this.graph.path(from, to);
            }
            this.board.delete(from);
            this.board.set(to, this.currplayer);
            for (let i = 0; i < path!.length - 1; i++) {
                this.results.push({type: "move", from: path![i], to: path![i+1]});
            }
            if (dir !== undefined) {
                const neighbour = this.graph.coords2algebraic(...RectGrid.move(...this.graph.algebraic2coords(to), dir));
                this.fences.push([to, neighbour]);
                this.graph.graph.dropEdge(to, neighbour);
                this.results.push({type: "block", between: [to, neighbour]});
            }
        // Check for stationary fence placement
        } else if ( (m.length === 3) && (/[NESW]$/.test(m)) ) {
            const cell = m.substring(0, m.length - 1);
            const dir = m[m.length - 1] as Directions;
            if (dir !== undefined) {
                const neighbour = this.graph.coords2algebraic(...RectGrid.move(...this.graph.algebraic2coords(cell), dir));
                this.fences.push([cell, neighbour]);
                this.graph.graph.dropEdge(cell, neighbour);
                this.results.push({type: "block", between: [cell, neighbour]});
            }
        // Otherwise it's placement
        } else {
            this.board.set(m, this.currplayer);
            this.pieces[this.currplayer - 1]--;
            this.results.push({type: "place", where: m})
        }

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

    protected checkEOG(): ACityGame {
        // If two passes in a row, we need to end
        let passedout = false;
        if ( (this.lastmove === "pass") && (this.stack[this.stack.length - 1].lastmove === "pass") ) {
            passedout = true;
        }
        // If no more open areas, tally up
        const areas = this.getAreas();
        if ( (areas.open.length === 0) || (passedout) ) {
            this.gameover = true;
            const score1 = this.getPlayerScore(1);
            const score2 = this.getPlayerScore(2);
            if (score1 > score2) {
                this.winner = [1];
            } else if (score1 < score2) {
                this.winner = [2];
            } else {
                this.winner = [1, 2];
            }
            this.results.push(
                {type: "eog"},
                {type: "winners", players: [...this.winner]}
            );
        }

        return this;
    }

    public state(): IACityState {
        return {
            game: ACityGame.gameinfo.uid,
            numplayers: this.numplayers,
            variants: this.variants,
            gameover: this.gameover,
            winner: [...this.winner],
            stack: [...this.stack]
        };
    }

    public moveState(): IMoveState {
        return {
            _version: ACityGame.gameinfo.version,
            _results: [...this.results],
            _timestamp: new Date(),
            currplayer: this.currplayer,
            lastmove: this.lastmove,
            board: new Map(this.board),
            pieces: [...this.pieces],
            fences: deepclone(this.fences) as [string, string][],
        };
    }

    public render(): APRenderRep {
        // Build piece string
        let pstr = "";
        const cells = this.graph.listCells(true);
        for (const row of cells) {
            if (pstr.length > 0) {
                pstr += "\n";
            }
            const pieces: string[] = [];
            for (const cell of row) {
                if (this.board.has(cell)) {
                    const contents = this.board.get(cell)!;
                    if (contents === 1) {
                        pieces.push("A");
                    } else {
                        pieces.push("B")
                    }
                } else {
                    pieces.push("-");
                }
            }
            pstr += pieces.join("");
        }

        // Build rep
        const markers: any[] = [];
        // First add fences
        for (const fence of this.fences) {
            const dir = this.graph.bearing(fence[0], fence[1]);
            const [x, y] = this.graph.algebraic2coords(fence[0]);
            markers.push({type: "fence", cell: {row: y, col: x}, side: dir});
        }
        // Now shade in closed areas
        const areas = this.getAreas();
        for (const area of areas.closed) {
            const owner = [...this.board.entries()].filter(e => area.has(e[0])).map(e => e[1])[0];
            for (const cell of area) {
                const [x, y] = this.graph.algebraic2coords(cell);
                markers.push({type: "shading", points: [{col: x, row: y}, {col: x+1, row: y}, {col: x+1, row: y+1}, {col: x, row: y+1}], colour: owner})
            }
        }

        const board = {
            style: "squares-beveled",
            width: 7,
            height: 7,
            markers,
        }
        const rep: APRenderRep =  {
            // @ts-ignore
            board,
            legend: {
                A: {
                    name: "piece",
                    player: 1
                },
                B: {
                    name: "piece",
                    player: 2
                }
            },
            pieces: pstr
        };

        // Add annotations
        if (this.results.length > 0) {
            // @ts-ignore
            rep.annotations = [];
            for (const move of this.results) {
                if (move.type === "move") {
                    const [fromX, fromY] = this.graph.algebraic2coords(move.from);
                    const [toX, toY] = this.graph.algebraic2coords(move.to);
                    rep.annotations.push({type: "move", targets: [{row: fromY, col: fromX}, {row: toY, col: toX}]});
                } else if (move.type === "place") {
                    const [x, y] = this.graph.algebraic2coords(move.where!);
                    rep.annotations.push({type: "enter", targets: [{row: y, col: x}]});
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

        status += "**Pieces In Hand**\n\n";
        for (let n = 1; n <= this.numplayers; n++) {
            const pieces = this.pieces[n - 1];
            status += `Player ${n}: ${pieces}\n\n`;
        }

        status += "**Scores**\n\n";
        for (let n = 1; n <= this.numplayers; n++) {
            status += `Player ${n}: ${this.getPlayerScore(n as playerid)}\n\n`;
        }

        return status;
    }

    public getPlayersScores(): IScores[] {
        return [
            { name: i18next.t("apgames:status.SCORES"), scores: [this.getPlayerScore(1), this.getPlayerScore(2)] },
            { name: i18next.t("apgames:status.PIECESINHAND"), scores: this.pieces }
        ]
    }

    protected getMoveList(): any[] {
        return this.getMovesAndResults(["move", "place"]);
    }

    public getPlayerPieces(player: number): number {
        return this.pieces[player - 1];
    }

    public getPlayerScore(player: number): number {
        let score = 0;

        const areas = this.getAreas();
        for (const area of areas.closed) {
            const pieces = [...this.board.entries()].filter(e => (area.has(e[0]) && (e[1] === player)));
            if (pieces.length > 0) {
                score += area.size;
            }
        }

        return score;
    }

    public chatLog(players: string[]): string[][] {
        // eog, resign, winners, place, move
        const result: string[][] = [];
        for (const state of this.stack) {
            if ( (state._results !== undefined) && (state._results.length > 0) ) {
                const node: string[] = [(state._timestamp && new Date(state._timestamp).toISOString()) || "unknown"];
                let otherPlayer = state.currplayer + 1;
                if (otherPlayer > this.numplayers) {
                    otherPlayer = 1;
                }
                let name = `Player ${otherPlayer}`;
                if (otherPlayer <= players.length) {
                    name = players[otherPlayer - 1];
                }

                const moves = state._results.filter(r => r.type === "move");
                if (moves.length > 0) {
                    const first = moves[0];
                    const last = moves[moves.length - 1];
                    const rest = moves.slice(0, moves.length - 1);
                    if ( moves.length > 2) {
                        // @ts-ignore
                        node.push(i18next.t("apresults:MOVE.chase", {player: name, from: first.from as string, to: last.to as string, through: rest.map(r => r.to as string).join(", ")}));
                    } else {
                        // @ts-ignore
                        node.push(i18next.t("apresults:MOVE.nowhat", {player: name, from: first.from as string, to: last.to as string}));
                    }
                }

                for (const r of state._results) {
                    switch (r.type) {
                        case "place":
                            node.push(i18next.t("apresults:PLACE.nowhat", {player: name, where: r.where}));
                            break;
                        case "block":
                            node.push(i18next.t("apresults:BLOCK.between", {player: name, cell1: r.between![0], cell2: r.between![1]}));
                            break;
                        case "pass":
                            node.push(i18next.t("apresults:PASS.simple", {player: name}));
                            break;
                        case "eog":
                            node.push(i18next.t("apresults:EOG"));
                            break;
                            case "resigned":
                                let rname = `Player ${r.player}`;
                                if (r.player <= players.length) {
                                    rname = players[r.player - 1]
                                }
                                node.push(i18next.t("apresults:RESIGN", {player: rname}));
                                break;
                            case "winners":
                                const names: string[] = [];
                                for (const w of r.players) {
                                    if (w <= players.length) {
                                        names.push(players[w - 1]);
                                    } else {
                                        names.push(`Player ${w}`);
                                    }
                                }
                                node.push(i18next.t("apresults:WINNERS", {count: r.players.length, winners: names.join(", ")}));
                                break;
                        }
                }
                result.push(node);
            }
        }
        return result;
    }

    public clone(): ACityGame {
        return new ACityGame(this.serialize());
    }
}

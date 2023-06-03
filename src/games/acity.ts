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
type PlacementResult = "GOOD"|"ROAD"|"DOMES"|"TOWERS"|"MARKER";

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

    public static piece2string(pc: Piece): string {
        let str = "";
        switch(pc[0]) {
            case "N":
                str += "black";
                break;
            case "R":
                str += "red";
                break;
            case "G":
                str += "green";
                break;
            case "B":
                str += "blue";
                break;
            default:
                str += "??";
                break;
        }
        switch(pc[1]) {
            case "D":
                str += " dome";
                break;
            case "T":
                str += " tower";
                break;
            default:
                str += " ??";
                break;
        }
        return str;
    }

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
        try {
            const cell = this.graph.coords2algebraic(col, row);
            let newmove = "";
            if (move === "") {
                // The only valid first option is clicking on a piece in your stash
                // So clicking anywhere on the board before then resets the move
                return {move: "", message: ""} as IClickResult;
            } else {
                // if the clicked space is empty, assume placement
                if (! this.board.has(cell)) {
                    newmove = move.substring(0, 2) + "-" + cell;
                // otherwise assume claiming
                } else {
                    newmove = move + `(${cell})`;
                }
            }

            const result = this.validateMove(newmove) as IClickResult;
            if (! result.valid) {
                // Don't wipe out the selected piece by default
                result.move = move.substring(0, 2);
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
            result.message = i18next.t("apgames:validation.acity.INITIAL_INSTRUCTIONS");
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
                result.message = i18next.t("apgames:validation.acity.INVALID_PASS");
                return result;
            }
        }

        const reMove = /^([RGBN][DT])(\-([a-h]\d+))?(\(([a-h]\d+)\))?$/;
        if (reMove.test(m)) {
            const [,pc,,to,,claim] = m.match(reMove)!; // can't be null because we tested

            // `pc` is guaranteed to be defined and at least well formed
            // you have such a piece in your stash
            if (! this.stashes[this.currplayer - 1].includes(pc as Piece)) {
                result.valid = false;
                result.message = i18next.t("apgames:validation.acity.INVALID_PIECE", {piece: ACityGame.piece2string(pc as Piece)});
                return result;
            }

            if ( (to !== undefined) && (to !== null) && (to.length > 0) ) {
                // cell is empty
                if (this.board.has(to)) {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation._general.OCCUPIED", {where: to});
                    return result;
                }
                const placement = this.canPlace(pc as Piece, to);
                // placing here may not break the road
                if (placement === "ROAD") {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.acity.BROKEN_ROAD", {where: to});
                    return result;
                }
                // domes on own colours unless all lots of that colour break the road
                if (placement === "DOMES") {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.acity.BAD_DOME");
                    return result;
                }
                // The first two structures built on a tile must be the same color as the tile, except for towers on black tiles
                if (placement === "TOWERS") {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.acity.BAD_TOWER");
                    return result;
                }
                // can't build on marker until all other possible lots occupied (SDG did exhaustive search of all possible piece placements on the tile)
                if (placement === "MARKER") {
                    result.valid = false;
                    result.message = i18next.t("apgames:validation.acity.MARKER");
                    return result;
                }

                // validate claim, if present
                if ( (claim !== undefined) && (claim !== null) && (claim.length > 0) ) {
                    // cell is occupied
                    if (! this.board.has(claim)) {
                        result.valid = false;
                        result.message = i18next.t("apgames:validation._general.NONEXISTENT", {where: claim});
                        return result;
                    }
                    // cell is a tower
                    if (this.board.get(claim)!.endsWith("T")) {
                        result.valid = false;
                        result.message = i18next.t("apgames:validation.acity.CLAIM_TOWERS");
                        return result;
                    }
                    // cell is not already claimed
                    if ( (this.claimed[0].includes(claim)) || (this.claimed[1].includes(claim)) ) {
                        result.valid = false;
                        result.message = i18next.t("apgames:validation.acity.DOUBLE_CLAIM", {where: claim});
                        return result;
                    }

                    // We're good
                    result.valid = true;
                    result.complete = 1;
                    result.message = i18next.t("apgames:validation._general.VALID_MOVE");
                    return result;
                } else {
                    if (this.claimed[this.currplayer - 1].length < 3) {
                        result.valid = true;
                        result.complete = 0;
                        result.canrender = true;
                        result.message = i18next.t("apgames:validation.acity.VALID_W_CLAIMS");
                        return result;
                    } else {
                        result.valid = true;
                        result.complete = 1;
                        result.message = i18next.t("apgames:validation._general.VALID_MOVE");
                        return result;
                    }
                }
            } else {
                result.valid = true;
                result.complete = -1;
                result.message = i18next.t("apgames:validation.acity.PARTIAL_MOVE");
                return result;
            }
        } else {
            result.valid = false;
            result.message = i18next.t("apgames:validation._general.INVALID_MOVE", {move: m});
            return result;
        }
    }

    private placePiece(piece: Piece, cell: string): void {
        this.board.set(cell, piece);
        for (const n of this.graph.neighbours(cell)) {
            if (this.board.has(n)) {
                this.graph.graph.dropEdge(cell, n);
            }
        }
    }

    // RECURSION ALERT!
    // This function has to call itself to validate certain types of placement.
    private canPlace(piece: Piece, cell: string): PlacementResult {
        // ROAD
        let cloned = deepclone(this) as ACityGame;
        cloned.placePiece(piece, cell);
        if (! cloned.graph.isConnected()) {
            return "ROAD";
        }

        // DOMES
        // domes on own colours unless all lots of that colour break the road
        const pcColor = piece[0] as Color;
        const [cellColor,] = this.cell2guild(cell);
        if (pcColor !== cellColor) {
            // get list of empty cells of that colour
            const cells = cloned.getEmptyGuild(pcColor);
            // check that every cell breaks the road
            let broken = true;
            for (const c of cells) {
                cloned = deepclone(this) as ACityGame;
                cloned.placePiece(piece, c);
                if (cloned.graph.isConnected()) {
                    broken = false;
                    break;
                }
            }
            // if any valid placement is found, return the error
            if (! broken) {
                return "DOMES";
            }
        }

        // TOWERS
        // The first two structures built on a tile must be the same color as the tile, except for towers on black tiles
        if ( (cellColor !== "B") && (piece.endsWith("T")) && (pcColor !== cellColor) ) {
            // get list of occupied cells on that tile
            const built = this.cell2tile(cell).cells.filter(c => this.board.has(c)).length;
            if (built < 2) {
                return "TOWERS";
            }
        }

        // MARKER
        // can't build on marker until all other possible lots occupied (SDG did exhaustive search of all possible piece placements on the tile)
        const tile = this.cell2tile(cell);
        if (tile.marker === cell) {
            // get list of other empty cells on the tile
            const empties = tile.cells.filter(c => c !== cell && ! this.board.has(c));
            const allPieces = new Set<string>(...this.stashes[0], ...this.stashes[1]);
            let otherOptions = false;
            for (const other of empties) {
                for (const pc of allPieces) {
                    cloned = deepclone(this) as ACityGame;
                    if (cloned.canPlace(pc as Piece, other) === "GOOD") {
                        otherOptions = true;
                        break;
                    }
                }
                if (otherOptions) { break; }
            }
            if (otherOptions) {
                return "MARKER";
            }
        }

        return "GOOD";
    }

    private getEmptyGuild(color: Color): string[] {
        const empties = (this.graph.listCells() as string[]).filter(cell => ! this.board.has(cell));
        const cells: string[] = [];
        for (const cell of empties) {
            const [c,] = this.cell2guild(cell);
            if (c === color) {
                cells.push(cell);
            }
        }
        return cells;
    }

    public move(m: string, partial = false): ACityGame {
        if (this.gameover) {
            throw new UserFacingError("MOVES_GAMEOVER", i18next.t("apgames:MOVES_GAMEOVER"));
        }
        m = m.toLowerCase();
        m = m.replace(/\s+/g, "");
        const result = this.validateMove(m);
        if (! result.valid) {
            throw new UserFacingError("VALIDATION_GENERAL", result.message)
        }
        if ( (! partial) && (! this.moves().includes(m)) ) {
            throw new UserFacingError("VALIDATION_FAILSAFE", i18next.t("apgames:validation._general.FAILSAFE", {move: m}))
        }

        this.results = [];
        if (m === "pass") {
            this.results.push({type: "pass"});
        } else {
            const reMove = /^([RGBN][DT])(\-([a-h]\d+))(\(([a-h]\d+)\))?$/;
            if (reMove.test(m)) {
                const [,piece,,to,,claim] = m.match(reMove)!;
                // remove piece from stash
                const idx = this.stashes[this.currplayer - 1].findIndex(p => p === piece as Piece);
                if (idx !== -1) {
                    this.stashes[this.currplayer - 1].splice(idx, 1);
                } else {
                    throw new Error("Could not find the piece in the player's stash.");
                }
                // place on board
                if (this.board.has(to)) {
                    throw new Error(`The lot ${to} is already occupied!`);
                }
                this.board.set(to, piece as Piece);
                this.results.push({type: "place", where: to, what: ACityGame.piece2string(piece as Piece)});
                // claim if given
                if ( (claim !== undefined) && (claim !== null) && (claim.length > 0) ) {
                    this.claimed[this.currplayer - 1].push(claim);
                    this.results.push({type: "claim", where: to});
                }
            } else {
                throw new Error("Move not well formed.");
            }
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
        if (passedout) {
            // nullify last-move claim
            if (/\([a-h]\d+\)$/.test(this.lastmove!)) { // has to be defined at this point
                const [claim] = this.lastmove!.match(/\(([a-h]\d+)\)$/)!;
                this.claimed[0] = this.claimed[0].filter(c => c !== claim);
                this.claimed[1] = this.claimed[1].filter(c => c !== claim);
                this.results.push({type: "nullifyClaim", where: claim});
            }
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
            stack: [...this.stack],
            startpos: deepclone(this.startpos) as [Color,MarkerPos][],
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
            stashes: deepclone(this.stashes) as [Piece[],Piece[]],
            claimed: deepclone(this.claimed) as [string[],string[]],
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

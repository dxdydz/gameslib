import { RectGrid } from "./rectGrid";
import { reviver, replacer, sortingReplacer } from "./serialization";
import { shuffle } from "./shuffle";
import { UserFacingError } from "./errors";
import { HexTriGraph, SnubSquareGraph, SquareOrthGraph, SquareGraph, SquareFanoronaGraph } from "./graphs";
import { wng } from "./namegenerator";

export { RectGrid, reviver, replacer, sortingReplacer, shuffle, UserFacingError, HexTriGraph, SnubSquareGraph, SquareOrthGraph, SquareGraph, SquareFanoronaGraph, wng };

export type DirectionsCardinal = "N" | "E" | "S" | "W";
export type DirectionsDiagonal = "NE" | "SE" | "SW" | "NW";
export type Directions = DirectionsCardinal | DirectionsDiagonal;

export const allDirections: Directions[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const oppositeDirections: Map<Directions, Directions> = new Map([
    ["N", "S"], ["NE", "SW"], ["E", "W"], ["SE", "NW"],
    ["S", "N"], ["SW", "NE"], ["W", "E"], ["NW", "SE"]
]);

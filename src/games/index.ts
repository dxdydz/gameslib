/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { APGamesInformation } from "../schemas/gameinfo";
import { GameBase, GameBaseSimultaneous, IAPGameState } from "./_base";
import { AmazonsGame, IAmazonsState } from "./amazons";
import { BlamGame, IBlamState } from "./blam";
import { CannonGame, ICannonState } from "./cannon";
import { MchessGame, IMchessState } from "./mchess";
import { HomeworldsGame, IHomeworldsState } from "./homeworlds";
import { EntropyGame, IEntropyState } from "./entropy";
import { VolcanoGame, IVolcanoState } from "./volcano";
import { MvolcanoGame, IMvolcanoState } from "./mvolcano";
import { ChaseGame, IChaseState } from "./chase";
import { AbandeGame, IAbandeState } from "./abande";
import { CephalopodGame, ICephalopodState } from "./ceph";
import { LinesOfActionGame, ILinesOfActionState } from "./loa";
import { PikemenGame, IPikemenState } from "./pikemen";
import { OrdoGame, IOrdoState } from "./ordo";
import { AttangleGame, IAttangleState } from "./attangle";
import { AccastaGame, IAccastaState } from "./accasta";
import { EpamGame, IEpamState } from "./epam";
import { TaijiGame, ITaijiState } from "./taiji";
import { BreakthroughGame, IBreakthroughState } from "./breakthrough";
import { FabrikGame, IFabrikState } from "./fabrik";
import { ManalathGame, IManalathState } from "./manalath";
import { UrbinoGame, IUrbinoState } from "./urbino";
import { FendoGame, IFendoState } from "./fendo";
import { ArchimedesGame, IArchimedesState } from "./archimedes";
import { ZolaGame, IZolaState } from "./zola";
import { MonkeyQueenGame, IMonkeyQueenState } from "./monkey";
import { DipoleGame, IDipoleState } from "./dipole";
import { AlfredsWykeGame, IAlfredsWykeState } from "./wyke";
import { RealmGame, IRealmState } from "./realm";
import { ACityGame, IACityState } from "./acity";
import { FanoronaGame, IFanoronaState } from "./fanorona";
import { FocusGame, IFocusState } from "./focus";
import { StringsGame, IStringsState } from "./strings";
import { WitchGame, IWitchState } from "./witch";
import { ComplicaGame, IComplicaState } from "./complica";
import { PigsGame, IPigsState } from "./pigs";
import { GardenGame, IGardenState } from "./garden";
import { OrbGame, IOrbState } from "./orb";
import { MixtourGame, IMixtourState } from "./mixtour";
import { CrosswayGame, ICrosswayState } from "./crossway";
import { TintasGame, ITintasState } from "./tintas";
import { StreetcarGame, IStreetcarState } from "./streetcar";
import { CourtesanGame, ICourtesanState } from "./courtesan";

export {
    APGamesInformation, GameBase, GameBaseSimultaneous, IAPGameState,
    AmazonsGame, IAmazonsState,
    BlamGame, IBlamState,
    CannonGame, ICannonState,
    MchessGame, IMchessState,
    HomeworldsGame, IHomeworldsState,
    EntropyGame, IEntropyState,
    VolcanoGame, IVolcanoState,
    MvolcanoGame, IMvolcanoState,
    ChaseGame, IChaseState,
    AbandeGame, IAbandeState,
    CephalopodGame, ICephalopodState,
    LinesOfActionGame, ILinesOfActionState,
    PikemenGame, IPikemenState,
    OrdoGame, IOrdoState,
    AttangleGame, IAttangleState,
    AccastaGame, IAccastaState,
    EpamGame, IEpamState,
    TaijiGame, ITaijiState,
    BreakthroughGame, IBreakthroughState,
    FabrikGame, IFabrikState,
    ManalathGame, IManalathState,
    UrbinoGame, IUrbinoState,
    FendoGame, IFendoState,
    ArchimedesGame, IArchimedesState,
    ZolaGame, IZolaState,
    MonkeyQueenGame, IMonkeyQueenState,
    DipoleGame, IDipoleState,
    AlfredsWykeGame, IAlfredsWykeState,
    RealmGame, IRealmState,
    ACityGame, IACityState,
    FanoronaGame, IFanoronaState,
    FocusGame, IFocusState,
    StringsGame, IStringsState,
    WitchGame, IWitchState,
    ComplicaGame, IComplicaState,
    PigsGame, IPigsState,
    GardenGame, IGardenState,
    OrbGame, IOrbState,
    MixtourGame, IMixtourState,
    CrosswayGame, ICrosswayState,
    TintasGame, ITintasState,
    StreetcarGame, IStreetcarState,
    CourtesanGame, ICourtesanState,
};

const games = new Map<string, typeof AmazonsGame | typeof BlamGame | typeof CannonGame |
                              typeof MchessGame | typeof HomeworldsGame | typeof EntropyGame |
                              typeof VolcanoGame | typeof MvolcanoGame | typeof ChaseGame |
                              typeof AbandeGame | typeof CephalopodGame | typeof LinesOfActionGame |
                              typeof PikemenGame | typeof OrdoGame | typeof AttangleGame |
                              typeof AccastaGame | typeof EpamGame | typeof TaijiGame |
                              typeof BreakthroughGame | typeof FabrikGame | typeof ManalathGame |
                              typeof UrbinoGame | typeof FendoGame | typeof ArchimedesGame |
                              typeof ZolaGame | typeof MonkeyQueenGame | typeof DipoleGame |
                              typeof AlfredsWykeGame | typeof RealmGame | typeof ACityGame |
                              typeof FanoronaGame | typeof FocusGame | typeof StringsGame |
                              typeof WitchGame | typeof ComplicaGame | typeof PigsGame |
                              typeof GardenGame | typeof OrbGame | typeof MixtourGame |
                              typeof CrosswayGame | typeof TintasGame | typeof StreetcarGame |
                              typeof CourtesanGame
                >();
// Manually add each game to the following array
[AmazonsGame, BlamGame, CannonGame, MchessGame, HomeworldsGame, EntropyGame, VolcanoGame, MvolcanoGame, ChaseGame, AbandeGame, CephalopodGame, LinesOfActionGame, PikemenGame, OrdoGame, AttangleGame, AccastaGame, EpamGame, TaijiGame, BreakthroughGame, FabrikGame, ManalathGame, UrbinoGame, FendoGame, ArchimedesGame, ZolaGame, MonkeyQueenGame, DipoleGame, AlfredsWykeGame, RealmGame, ACityGame, FanoronaGame, FocusGame, StringsGame, WitchGame, ComplicaGame, PigsGame, GardenGame, OrbGame, MixtourGame, CrosswayGame, TintasGame, StreetcarGame, CourtesanGame].forEach((g) => {
    if (games.has(g.gameinfo.uid)) {
        throw new Error("Another game with the UID '" + g.gameinfo.uid + "' has already been used. Duplicates are not allowed.");
    }
    games.set(g.gameinfo.uid, g);
});
export { games };

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GameFactory = (game: string, ...args: any[]): GameBase|GameBaseSimultaneous|undefined => {
    switch (game) {
        case "amazons":
            return new AmazonsGame(...args);
        case "blam":
            return new BlamGame(args[0], ...args);
        case "cannon":
            return new CannonGame(...args);
        case "mchess":
            return new MchessGame(...args);
        case "homeworlds":
            return new HomeworldsGame(args[0]);
        case "entropy":
            return new EntropyGame(...args);
        case "volcano":
            return new VolcanoGame(...args);
        case "mvolcano":
            return new MvolcanoGame(...args);
        case "chase":
            return new ChaseGame(...args);
        case "abande":
            return new AbandeGame(...args);
        case "ceph":
            return new CephalopodGame(...args);
        case "loa":
            return new LinesOfActionGame(...args);
        case "pikemen":
            return new PikemenGame(...args);
        case "ordo":
            return new OrdoGame(...args);
        case "attangle":
            return new AttangleGame(...args);
        case "accasta":
            return new AccastaGame(...args);
        case "epam":
            return new EpamGame(...args);
        case "taiji":
            return new TaijiGame(...args);
        case "breakthrough":
            return new BreakthroughGame(...args);
        case "fabrik":
            return new FabrikGame(...args);
        case "manalath":
            return new ManalathGame(...args);
        case "urbino":
            return new UrbinoGame(...args);
        case "fendo":
            return new FendoGame(...args);
        case "archimedes":
            return new ArchimedesGame(...args);
        case "zola":
            return new ZolaGame(...args);
        case "monkey":
            return new MonkeyQueenGame(...args);
        case "dipole":
            return new DipoleGame(...args);
        case "wyke":
            return new AlfredsWykeGame(...args);
        case "realm":
            return new RealmGame(...args);
        case "acity":
            return new ACityGame(...args);
        case "fanorona":
            return new FanoronaGame(...args);
        case "focus":
            return new FocusGame(...args);
        case "strings":
            return new StringsGame(...args);
        case "witch":
            return new WitchGame(...args);
        case "complica":
            return new ComplicaGame(...args);
        case "pigs":
            return new PigsGame(...args);
        case "garden":
            return new GardenGame(...args);
        case "orb":
            return new OrbGame(...args);
        case "mixtour":
            return new MixtourGame(...args);
        case "crossway":
            return new CrosswayGame(...args);
        case "tintas":
            return new TintasGame(...args);
        case "streetcar":
            return new StreetcarGame(...args);
        case "courtesan":
            return new CourtesanGame(...args);
    }
    return;
}

import type { CardView } from "../net/protocol";
import { CardTile } from "./CardTile";
import { DonStrip } from "./DonStrip";
import { ZonePile } from "./ZonePile";

type SideData = {
  leader: CardView;
  characters: CardView[];
  stage: CardView | null;
  deckCount: number;
  trash: string[];
  lifeCount: number;
  donDeckCount: number;
  costArea?: { id: string; rested: boolean }[];
  costAreaCount?: number;
  activeDonCount: number;
  handCount?: number;
};

type Props = {
  side: "you" | "opp";
  data: SideData;
  compact?: boolean;
};

export function SideField({ side, data, compact }: Props) {
  const mirrored = side === "opp";

  return (
    <section className={`side-field side-${side}${mirrored ? " mirrored" : ""}`}>
      <div className="side-grid">
        <div className="zone-life">
          <ZonePile label="Life" count={data.lifeCount} variant="life" secret />
        </div>

        <div className="zone-characters">
          <div className="zone-caption">Characters</div>
          <div className="card-row characters-row">
            {data.characters.length === 0 ? (
              <div className="zone-slot empty">—</div>
            ) : (
              data.characters.map((c) => (
                <CardTile
                  key={c.id}
                  defId={c.defId}
                  compact={compact || mirrored}
                  rested={c.rested}
                  power={c.power}
                  attachedDonCount={c.attachedDonCount}
                  inspectOnClick
                />
              ))
            )}
            {Array.from({ length: Math.max(0, 5 - data.characters.length) }).map((_, i) => (
              <div key={`slot-${i}`} className="zone-slot" aria-hidden />
            ))}
          </div>
        </div>

        <div className="zone-deck">
          <ZonePile label="Deck" count={data.deckCount} variant="deck" />
        </div>

        <div className="zone-leader">
          <div className="zone-caption">Leader</div>
          <CardTile
            defId={data.leader.defId}
            compact={compact || mirrored}
            rested={data.leader.rested}
            power={data.leader.power}
            attachedDonCount={data.leader.attachedDonCount}
            frame="leader"
            inspectOnClick
          />
        </div>

        <div className="zone-stage">
          <div className="zone-caption">Stage</div>
          {data.stage ? (
            <CardTile
              defId={data.stage.defId}
              compact={compact || mirrored}
              rested={data.stage.rested}
              inspectOnClick
            />
          ) : (
            <div className="zone-slot stage-empty">Stage</div>
          )}
        </div>

        <div className="zone-don-deck">
          <ZonePile label="DON!! Deck" count={data.donDeckCount} variant="don" />
        </div>

        <div className="zone-cost">
          <DonStrip
            side={side}
            tokens={data.costArea}
            activeCount={data.activeDonCount}
            totalCount={data.costAreaCount ?? data.costArea?.length ?? 0}
          />
        </div>

        <div className="zone-trash">
          <ZonePile label="Trash" count={data.trash.length} variant="trash" />
        </div>
      </div>
    </section>
  );
}

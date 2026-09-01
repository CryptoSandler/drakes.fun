// The slot the artwork will occupy, drawn empty at its real size.
//
// Caller: `app/page.tsx` (the catalogue entry) and `app/piece/[id]/page.tsx`
// when that exists.
//
// **There is no art and this does not pretend otherwise.** No stock image, no
// generated stand-in, no borrowed mood reference — a placeholder that looks like
// a picture is a picture that has to be un-shipped later, and a reviewer looking
// at it is reviewing the wrong thing. This is a marked hole with the dimensions
// written on it.
//
// It carries **the 48 px avatar guard beside it**, because `DESIGN.md` §9.1 says
// the piece is an avatar before it is an image and §9.2 writes the guard against
// exactly that size. Drawing the two together is what stops the illustrator
// brief and the site from drifting apart: whatever fills the square has to
// survive the circle.

export function ArtSlot({ pieceId }: { pieceId: number | null }) {
  return (
    <figure className="artslot" aria-label="Artwork not yet delivered">
      <div className="artslot__square">
        <span className="artslot__size">1000 × 1000</span>
        <span className="artslot__word">art pending</span>
      </div>
      <div className="artslot__guard">
        <span className="artslot__circle" />
        <span className="artslot__caption">
          48 px avatar guard
          <br />
          <span className="note">{pieceId === null ? 'no piece' : `#${pieceId}`}</span>
        </span>
      </div>
      <figcaption className="artslot__note">
        No artwork exists yet. This slot stays empty until the illustrator delivers; nothing on this
        page is a stand-in for a Drake.
      </figcaption>
    </figure>
  )
}

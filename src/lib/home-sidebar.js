const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function getHomeSidebarFrame({ viewportHeight, boundaryTop, boundaryBottom }) {
  const viewport = Math.max(0, finiteNumber(viewportHeight));
  const top = Math.min(viewport, Math.max(0, finiteNumber(boundaryTop)));
  const bottom = finiteNumber(boundaryBottom, top);
  const viewportRoom = Math.max(0, viewport - top);
  const boundaryRoom = Math.max(0, bottom - top);

  return {
    top,
    height: Math.min(viewportRoom, boundaryRoom),
  };
}

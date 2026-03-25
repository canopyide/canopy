const SKELETON_ID = "startup-skeleton";

export function removeStartupSkeleton(): () => void {
  const el = document.getElementById(SKELETON_ID);
  if (!el) return () => {};

  let outer = 0;
  let inner = 0;

  outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(() => {
      el.remove();
    });
  });

  return () => {
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
  };
}

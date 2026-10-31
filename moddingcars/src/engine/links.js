// Research links for each mod. v1 builds search links (they never go stale).
// Later, "links to buy parts" can replace this module with a provider that
// returns vendor/affiliate product links; the plan shape stays the same.

const enc = encodeURIComponent;

export function modLinks({ car, gen, mod }) {
  const vehicle = `${car.make} ${car.model} ${gen.name} ${gen.years}`;
  const q = `${vehicle} ${mod.search}`;
  const links = [
    { kind: 'parts', label: 'Shop parts', url: `https://www.google.com/search?tbm=shop&q=${enc(q)}` },
    { kind: 'guide', label: 'Install videos', url: `https://www.youtube.com/results?search_query=${enc(`${vehicle} ${mod.search} install`)}` },
  ];
  if (gen.forum) {
    links.push({
      kind: 'forum',
      label: `Owner forum (${gen.forum})`,
      url: `https://www.google.com/search?q=${enc(`site:${gen.forum} ${mod.search}`)}`,
    });
  }
  return links;
}

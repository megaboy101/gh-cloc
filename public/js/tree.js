// Folder tree over a path-sorted file list. Each node covers files[start..end).
// Children are computed on demand so huge repos only pay for folders you open.

export function rootNode(files) {
  return { name: '', path: '', dir: true, start: 0, end: files.length };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function children(files, node) {
  if (node.kids) return node.kids;
  const dirs = [], leaves = [];
  const prefix = node.path;
  let i = node.start;
  while (i < node.end) {
    const rest = files[i].path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      leaves.push({ name: rest, path: files[i].path, dir: false, start: i, end: i + 1 });
      i++;
      continue;
    }
    const sub = prefix + rest.slice(0, slash + 1);
    let j = i;
    while (j < node.end && files[j].path.startsWith(sub)) j++;
    dirs.push({ name: rest.slice(0, slash), path: sub, dir: true, start: i, end: j });
    i = j;
  }
  const byName = (a, b) => collator.compare(a.name, b.name);
  node.kids = [...dirs.sort(byName), ...leaves.sort(byName)];
  return node.kids;
}

/** Collapse single-child folder chains ("src/main/java/com/x") into one row, like GitHub. */
export function compact(files, node) {
  let n = node;
  let name = node.name;
  while (true) {
    const kids = children(files, n);
    if (kids.length !== 1 || !kids[0].dir) break;
    n = kids[0];
    name += '/' + n.name;
  }
  return n === node ? node : { ...n, name, kids: n.kids };
}

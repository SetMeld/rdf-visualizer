/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useState, type MouseEvent } from 'react';
import { UNTYPED, resourceName, type TypeGroup } from './rdf/focus';

/** Past this, a type's member list asks for a search instead of rendering thousands of rows. */
const MEMBER_LIMIT = 200;

type Props = {
  groups: TypeGroup[];
  typeColors: Record<string, string>;
  activeTypes: readonly string[];
  selectedId?: string;
  /** `additive` when the click held ⌘ or Ctrl, to add the type to the filter rather than replace it. */
  onFilterType: (key: string, additive: boolean) => void;
  onOpenResource: (id: string) => void;
};

/** Every rdf:type in the graph, each expandable to the resources that have it. */
export function TypeNav({ groups, typeColors, activeTypes, selectedId, onFilterType, onOpenResource }: Props) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = groups.flatMap((group) => {
    const title = group.type?.label ?? 'Untyped';
    if (!needle) return [{ group, title, members: group.members, open: expanded.has(group.key) }];
    const titleMatches = title.toLowerCase().includes(needle) || group.key.toLowerCase().includes(needle);
    const members = titleMatches
      ? group.members
      : group.members.filter(
          (member) => resourceName(member).toLowerCase().includes(needle) || member.id.toLowerCase().includes(needle),
        );
    if (members.length === 0) return [];
    // A search that found resources rather than the type itself shows them without another click.
    return [{ group, title, members, open: expanded.has(group.key) || !titleMatches }];
  });

  return (
    <nav className="type-nav" aria-label="Types">
      <div className="type-nav__search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search types and nodes"
          aria-label="Search types and nodes"
        />
      </div>
      <div className="type-nav__hint">Click a type to filter · ⌘/Ctrl-click to add</div>
      <ul className="type-nav__groups">
        {rows.map(({ group, title, members, open }) => {
          const active = activeTypes.includes(group.key);
          return (
            <li key={group.key}>
              <div className={`type-nav__type ${active ? 'type-nav__type--active' : ''}`}>
                <button
                  type="button"
                  className="type-nav__chevron"
                  aria-expanded={open}
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
                  onClick={() => toggle(group.key)}
                >
                  {open ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  className="type-nav__name"
                  title={group.key === UNTYPED ? 'Resources with no rdf:type' : group.key}
                  aria-pressed={active}
                  onClick={(event: MouseEvent) => onFilterType(group.key, event.metaKey || event.ctrlKey)}
                >
                  <span
                    className="type-nav__swatch"
                    style={{ background: typeColors[group.key] ?? 'var(--untyped-header)' }}
                  />
                  <span className="type-nav__label">{title}</span>
                  <span className="type-nav__count">{group.members.length}</span>
                </button>
              </div>
              {open && (
                <ul className="type-nav__members">
                  {members.slice(0, MEMBER_LIMIT).map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        className={`type-nav__member ${member.id === selectedId ? 'type-nav__member--selected' : ''}`}
                        title={member.id}
                        onClick={() => onOpenResource(member.id)}
                      >
                        {resourceName(member)}
                      </button>
                    </li>
                  ))}
                  {members.length > MEMBER_LIMIT && (
                    <li className="type-nav__more">{members.length - MEMBER_LIMIT} more — search to narrow down</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="type-nav__more">{needle ? 'No matches' : 'No resources'}</li>}
      </ul>
    </nav>
  );
}

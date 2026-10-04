import Sheet from "../../../components/ui/Sheet";

function ChipGroup({ title, options, value, onChange, multi = false }) {
  if (!options.length) return null;
  const isOn = (v) => (multi ? value.includes(v) : value === v);
  const toggle = (v) => {
    if (multi) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else onChange(value === v ? "" : v);
  };
  return (
    <div className="filter-group">
      <div className="filter-group-title">{title}</div>
      <div className="chip-set">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={isOn(o.value)}
            onClick={() => toggle(o.value)}
          >
            {o.label}
            {o.count != null && <span className="chip-count">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FilterSheet({
  open,
  onClose,
  filters,
  setFilter,
  facets,
  sortOptions,
  resultCount,
  onReset,
  isAdmin,
  list,
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter & sort"
      width={560}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            Reset
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Show {resultCount}
          </button>
        </>
      }
    >
      <ChipGroup
        title="Sort by"
        options={sortOptions}
        value={filters.sort}
        onChange={(v) => setFilter("sort", v || "title")}
      />
      {list === "library" && (
        <ChipGroup
          title="Reading status"
          options={[
            { value: "unread", label: "Unread" },
            { value: "reading", label: "In progress" },
            { value: "read", label: "Finished" },
          ]}
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
        />
      )}
      <ChipGroup
        title="Demographic"
        options={facets.demographic}
        value={filters.demo}
        onChange={(v) => setFilter("demo", v)}
        multi
      />
      <ChipGroup
        title="Genre"
        options={facets.genre}
        value={filters.genre}
        onChange={(v) => setFilter("genre", v)}
        multi
      />
      <ChipGroup
        title="Publisher"
        options={facets.publisher}
        value={filters.pub}
        onChange={(v) => setFilter("pub", v)}
        multi
      />
      {list === "library" && (
        <ChipGroup
          title="Edition"
          options={[
            { value: "specialEdition", label: "Special edition" },
            { value: "collectible", label: "Collectible" },
          ]}
          value={filters.edition}
          onChange={(v) => setFilter("edition", v)}
        />
      )}
      {isAdmin && (
        <ChipGroup
          title="Admin"
          options={[
            { value: "missing", label: "Needs info" },
            { value: "hidden", label: "Hidden only" },
          ]}
          value={filters.admin}
          onChange={(v) => setFilter("admin", v)}
        />
      )}
    </Sheet>
  );
}

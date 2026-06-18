export default function SortSelect({
  value,
  onChange,
  options = [],
  label = "Sort products",
  className,
  style,
  selectClassName,
  selectStyle,
}) {
  return (
    <label className={className} style={style}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={onChange} aria-label={label} className={selectClassName} style={selectStyle}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

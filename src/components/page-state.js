export default function PageState({ title, children, as: Component = "div", className = "" }) {
  return (
    <Component className={`category-empty-state${className ? ` ${className}` : ""}`}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </Component>
  );
}

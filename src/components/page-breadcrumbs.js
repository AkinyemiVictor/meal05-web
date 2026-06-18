import Link from "next/link";
import { Fragment } from "react";

export default function PageBreadcrumbs({ items = [] }) {
  return (
    <nav className="page-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <span aria-hidden="true" className="page-breadcrumb-divider">
                /
              </span>
            ) : null}
            {item.href && !isLast ? (
              <Link href={item.href}>{item.label}</Link>
            ) : isLast ? (
              <span className="page-breadcrumb-current">{item.label}</span>
            ) : (
              <span className="page-breadcrumb-node">{item.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

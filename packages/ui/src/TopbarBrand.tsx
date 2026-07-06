'use client';

import { APP_NAME } from '@lingprism/shared';

interface TopbarBrandProps {
  href?: string;
  iconClassName?: string;
}

export function TopbarBrand({ href = '/', iconClassName = 'lp-brand-icon' }: TopbarBrandProps) {
  return (
    <a className="lp-brand" href={href}>
      <div className={iconClassName}>镜</div>
      <span className="lp-brand-text">
        {APP_NAME} <span className="lp-brand-sub">LingPrism</span>
      </span>
    </a>
  );
}

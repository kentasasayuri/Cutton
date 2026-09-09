import React from 'react';
export function Button({ icon: Icon, children, action, entity, className = '', ...props }) {
  return <button type="button" className={`button ${!children ? 'icon-button' : ''} ${className}`} data-action={action} data-entity-id={entity} {...props}>{Icon && <Icon size={15} strokeWidth={1.7} />}{children}</button>;
}
export function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }

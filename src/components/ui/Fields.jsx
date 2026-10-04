import { useId } from "react";

export function Field({ label, hint, missing, children, className = "", style }) {
  return (
    <div className={`field ${missing ? "is-missing" : ""} ${className}`} style={style}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Labelled text/number/date input. `prefix` renders an adornment like "$". */
export function TextField({ label, hint, missing, prefix, value, onChange, className, style, ...rest }) {
  const id = useId();
  const input = (
    <input id={id} className="input" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} {...rest} />
  );
  return (
    <div className={`field ${missing ? "is-missing" : ""} ${className || ""}`} style={style}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {prefix ? (
        <div className="input-wrap">
          <span className="input-adorn">{prefix}</span>
          {input}
        </div>
      ) : (
        input
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function SelectField({ label, hint, missing, value, onChange, options, placeholder, className, ...rest }) {
  const id = useId();
  return (
    <div className={`field ${missing ? "is-missing" : ""} ${className || ""}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <select id={id} className="select" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Switch({ label, checked, onChange, indeterminate, ...rest }) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={!!checked}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate;
        }}
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      {label}
    </label>
  );
}

export function PrimaryButton({ className = '', ...props }) {
  return <button className={`primary-button ${className}`.trim()} type="button" {...props} />;
}

export function SecondaryButton({ className = '', ...props }) {
  return <button className={`secondary-button ${className}`.trim()} type="button" {...props} />;
}

export function FloatingActionButton({ className = '', ...props }) {
  return <button className={`add-fab ${className}`.trim()} type="button" {...props} />;
}

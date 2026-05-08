export default function AppCard({ as: Component = 'section', className = '', children, ...props }) {
  return (
    <Component className={`app-card ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

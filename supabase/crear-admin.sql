-- Crear administrador después de registrar usuario en Authentication
-- 1. Ve a Authentication > Users > Add user (email + password)
-- 2. Copia el UUID del usuario
-- 3. Reemplaza abajo y ejecuta:


INSERT INTO administradores (id, email, nombre, rol, activo)
VALUES (
  '2d235f2c-c7a0-44fe-aa93-da24a4ad7daa',
  'tutacanehuillca@gmail.com',
  'Administrador Principal',
  'super_admin',
  true
);


-- Ejemplo con email (si ya existe en auth.users):
INSERT INTO administradores (id, email, nombre, rol, activo)
SELECT id, email, 'Admin El Pollón', 'super_admin', true
FROM auth.users
WHERE email = 'admin@elpollon.cl'
ON CONFLICT (id) DO UPDATE SET activo = true, rol = 'super_admin';

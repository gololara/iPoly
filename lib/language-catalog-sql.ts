// Legacy IDs are exposed without modifying existing rows. A configured language
// in a fresh account cannot accidentally unlock the other legacy default.
export const languageCatalogSql = `
WITH configured AS (
 SELECT id,name,created_at FROM learning_languages WHERE owner=?1
), legacy AS (
 SELECT language FROM notes WHERE owner=?1 AND language IN ('sq','en')
 UNION ALL SELECT language_id FROM teachers WHERE owner=?1 AND language_id IN ('sq','en')

), inherited AS (
 SELECT 'sq' AS id,'Shqip' AS name,'1970-01-01T00:00:00.000Z' AS created_at
 UNION ALL SELECT 'en','English','1970-01-01T00:00:00.001Z'
)
SELECT id,name,created_at FROM configured
UNION ALL
SELECT id,name,created_at FROM inherited
WHERE EXISTS(SELECT 1 FROM legacy l WHERE NOT EXISTS(SELECT 1 FROM configured c WHERE c.id=l.language))
 AND NOT EXISTS(SELECT 1 FROM configured c WHERE c.id=inherited.id)`;

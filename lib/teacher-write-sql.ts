export const teacherEditInsertSql='INSERT INTO teacher_edits(id,owner,teacher_id,version,request_hash,content,created_at) VALUES(?,?,?,?,?,?,?)';
export const teacherUpdateSql='UPDATE teachers SET name=?,languages=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=?';

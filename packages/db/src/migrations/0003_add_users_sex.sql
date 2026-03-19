-- Handle both cases: "sex" column may or may not exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'sex'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "sex" TO "gender";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'gender'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "gender" varchar(10);
  END IF;
END
$$;
import pgPromise from "pg-promise";
const pgp = pgPromise();
import { genSalt, hash } from "bcrypt";

const db = pgp({
    host: "localhost",
    port: 5432,
    database: "MessageRoom", // pending
    password: undefined,
    max: 30,
});

export default db;

(async () => {
    try {
        await db.one("SELECT 1");
    } catch (error) {
        console.log(
            "Connection failed, check if the database is up or if permissions are set",
        );
        console.error(error);
        process.exit(1);
    }
})();

export async function initDataBase() {
    let getTableQuery = `SELECT EXISTS (
		SELECT FROM information_schema.tables 
		WHERE  table_schema = 'public'
		AND    table_name   = $1
	);`;

    let credentials = await db.one(getTableQuery, ["credentials"]);
    let users = await db.one(getTableQuery, ["users"]);

    if (!users.exists) {
        let usersTableQuery = `CREATE TABLE users (
				id SERIAL PRIMARY KEY,
				user_name VARCHAR(30),
				user_creation_date TIMESTAMP,
				age SMALLINT
		);`;

        try {
            await db.none(usersTableQuery);
        } catch (e) {
            console.error(e);
        }
    }
    if (!credentials.exists) {
        let credentialsTableQuery = `CREATE TABLE credentials (
				id SERIAL PRIMARY KEY,
				email VARCHAR(255),
				password CHAR(60),
				salt CHAR(16),
				user_id INTEGER REFERENCES users(id)
		);`;

        try {
            await db.none(credentialsTableQuery);
        } catch (e) {
            console.error(e);
        }
    }
}

export async function introduceCredentials(
    userName: string,
    email: string,
    password: string,
): Promise<string> {
    try {
        let salt = await genSalt(10);
        let hashedPass = await hash(password, salt);

        let check_user = await db.oneOrNone(
            "SELECT 1 FROM users WHERE user_name = $1",
            [userName],
        );

        if (check_user) {
            throw new Error("CREDENTIAL_CONFLICT");
        }

        let userID = await db.one(
            `INSERT INTO users (user_name) VALUES ($1) RETURNING id`,
            [userName],
        );

        await db.none(
            `INSERT INTO credentials (email, password, salt, user_id)
					  VALUES ($1, $2, $3, $4)`,
            [email, hashedPass, salt, userID.id],
        );

        return userName;
    } catch (error) {
        if (error instanceof Error && error.message == "CREDENTIAL_CONFLICT")
            throw error;

        throw new Error("INTERNAL_SERVER_ERROR");
    }
}

export async function loginUser(
    introducedEmail: string,
    introducedPassword: string,
): Promise<string> {
    let data = await db.oneOrNone(
        "SELECT salt, password, user_id FROM credentials WHERE email = $1",
        [introducedEmail],
    );

    if (!data) {
        throw new Error("EMAIL_NOT_FOUND");
    }

    let hashedPass = await hash(introducedPassword, data.salt);

    if (hashedPass !== data.password) {
        throw new Error("INCORRECT_PASSWORD");
    }

    let userName = await db.one("SELECT user_name FROM users WHERE id = $1", [
        data.user_id,
    ]);
    return userName.user_name;
}

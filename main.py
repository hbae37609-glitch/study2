# -*- coding: utf-8 -*-
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os
from datetime import date, datetime
from typing import Optional
from database import get_db, init_db

app = FastAPI(title="Study Cafe Friend & Battle API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
init_db()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

# Helper function to get head-to-head record between two users
def get_h2h_record(cursor, user_a_id: int, user_b_id: int):
    u1, u2 = min(user_a_id, user_b_id), max(user_a_id, user_b_id)
    cursor.execute("""
        SELECT user1_id, user2_id, user1_wins, user2_wins, draws
        FROM head_to_head
        WHERE user1_id = ? AND user2_id = ?
    """, (u1, u2))
    row = cursor.fetchone()
    if not row:
        return {"my_wins": 0, "opp_wins": 0, "draws": 0, "total": 0, "win_rate": 0}
    
    if user_a_id == u1:
        my_wins = row["user1_wins"]
        opp_wins = row["user2_wins"]
    else:
        my_wins = row["user2_wins"]
        opp_wins = row["user1_wins"]
    draws = row["draws"]
    total = my_wins + opp_wins + draws
    win_rate = round((my_wins / total) * 100) if total > 0 else 0
    return {
        "my_wins": my_wins,
        "opp_wins": opp_wins,
        "draws": draws,
        "total": total,
        "win_rate": win_rate
    }

# 1. Get current user profile
@app.get("/api/me")
def get_my_profile(user_id: int = Query(1)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    
    user_dict = dict(user)
    # Get current cafe details if checked in
    if user_dict["current_cafe_id"]:
        cursor.execute("SELECT * FROM study_cafes WHERE id = ?", (user_dict["current_cafe_id"],))
        cafe = cursor.fetchone()
        user_dict["current_cafe"] = dict(cafe) if cafe else None
    else:
        user_dict["current_cafe"] = None

    conn.close()
    return user_dict

# 2. List all users (for demo switcher)
@app.get("/api/users")
def get_all_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, school, grade, avatar, status, current_cafe_id, today_study_seconds FROM users")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users

# 3. Get all study cafes with friends & schoolmates breakdown
@app.get("/api/cafes")
def get_cafes(current_user_id: int = Query(1)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Get all cafes
    cursor.execute("SELECT * FROM study_cafes")
    cafes = [dict(r) for r in cursor.fetchall()]

    # Get friends IDs of current user
    cursor.execute("SELECT friend_id FROM friendships WHERE user_id = ?", (current_user_id,))
    friend_ids = {r["friend_id"] for r in cursor.fetchall()}

    # Get current user's school
    cursor.execute("SELECT school FROM users WHERE id = ?", (current_user_id,))
    user_row = cursor.fetchone()
    my_school = user_row["school"] if user_row else "한국고등학교"

    # For each cafe, attach users checked in
    for cafe in cafes:
        cafe_id = cafe["id"]
        cursor.execute("""
            SELECT id, name, school, grade, avatar, status, today_study_seconds, status_message
            FROM users
            WHERE current_cafe_id = ?
        """, (cafe_id,))
        occupants = [dict(r) for r in cursor.fetchall()]

        friends_here = []
        schoolmates_here = []

        for occ in occupants:
            is_friend = occ["id"] in friend_ids
            is_schoolmate = (occ["school"] == my_school)
            occ["is_friend"] = is_friend
            occ["is_me"] = (occ["id"] == current_user_id)

            if is_friend:
                friends_here.append(occ)
            elif is_schoolmate and not occ["is_me"]:
                schoolmates_here.append(occ)

        cafe["friends_here"] = friends_here
        cafe["schoolmates_here"] = schoolmates_here
        cafe["total_occupants"] = len(occupants)

    conn.close()
    return cafes

# 4. Friends list with real-time location & head-to-head records
@app.get("/api/friends")
def get_friends(current_user_id: int = Query(1)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT u.id, u.name, u.school, u.grade, u.avatar, u.status, 
               u.current_cafe_id, u.today_study_seconds, u.status_message,
               c.name as cafe_name, c.branch as cafe_branch
        FROM friendships f
        JOIN users u ON f.friend_id = u.id
        LEFT JOIN study_cafes c ON u.current_cafe_id = c.id
        WHERE f.user_id = ?
        ORDER BY u.status = 'STUDYING' DESC, u.status = 'RESTING' DESC, u.today_study_seconds DESC
    """, (current_user_id,))
    
    friends = []
    for row in cursor.fetchall():
        f = dict(row)
        f["h2h"] = get_h2h_record(cursor, current_user_id, f["id"])
        friends.append(f)

    conn.close()
    return friends

# 5. Check in / Check out of a study cafe
@app.post("/api/checkin")
def checkin_cafe(data: dict = Body(...)):
    user_id = data.get("user_id", 1)
    cafe_id = data.get("cafe_id")
    action = data.get("action", "CHECKIN") # CHECKIN or CHECKOUT

    conn = get_db()
    cursor = conn.cursor()

    if action == "CHECKIN":
        cursor.execute("""
            UPDATE users 
            SET current_cafe_id = ?, status = 'STUDYING', last_active = ?
            WHERE id = ?
        """, (cafe_id, datetime.now().isoformat(), user_id))
    else:
        cursor.execute("""
            UPDATE users 
            SET current_cafe_id = NULL, status = 'OFFLINE', last_active = ?
            WHERE id = ?
        """, (datetime.now().isoformat(), user_id))

    conn.commit()
    conn.close()
    return {"success": True, "action": action, "cafe_id": cafe_id}

# 6. Status change (STUDYING, RESTING, OFFLINE)
@app.post("/api/status")
def update_status(data: dict = Body(...)):
    user_id = data.get("user_id", 1)
    status = data.get("status", "STUDYING")
    status_msg = data.get("status_message")

    conn = get_db()
    cursor = conn.cursor()

    if status_msg is not None:
        cursor.execute("UPDATE users SET status = ?, status_message = ?, last_active = ? WHERE id = ?",
                       (status, status_msg, datetime.now().isoformat(), user_id))
    else:
        cursor.execute("UPDATE users SET status = ?, last_active = ? WHERE id = ?",
                       (status, datetime.now().isoformat(), user_id))

    conn.commit()
    conn.close()
    return {"success": True, "status": status}

# 7. Timer tick: update study seconds (for pure study timer)
@app.post("/api/timer/tick")
def timer_tick(data: dict = Body(...)):
    user_id = data.get("user_id", 1)
    added_seconds = data.get("seconds", 1)

    conn = get_db()
    cursor = conn.cursor()

    # Update user seconds
    cursor.execute("""
        UPDATE users 
        SET today_study_seconds = today_study_seconds + ?,
            week_study_seconds = week_study_seconds + ?,
            status = 'STUDYING',
            last_active = ?
        WHERE id = ?
    """, (added_seconds, added_seconds, datetime.now().isoformat(), user_id))

    # Also update any active battle for today
    today_str = date.today().isoformat()
    cursor.execute("""
        SELECT id, challenger_id, opponent_id FROM battles
        WHERE (challenger_id = ? OR opponent_id = ?) AND status = 'ACTIVE' AND battle_date = ?
    """, (user_id, user_id, today_str))
    active_battle = cursor.fetchone()

    if active_battle:
        battle_id = active_battle["id"]
        if active_battle["challenger_id"] == user_id:
            cursor.execute("UPDATE battles SET challenger_seconds = challenger_seconds + ? WHERE id = ?", (added_seconds, battle_id))
        else:
            cursor.execute("UPDATE battles SET opponent_seconds = opponent_seconds + ? WHERE id = ?", (added_seconds, battle_id))

    conn.commit()
    conn.close()
    return {"success": True, "added_seconds": added_seconds}

# 8. Active 1:1 Battle info for user
@app.get("/api/battle/active")
def get_active_battle(user_id: int = Query(1)):
    conn = get_db()
    cursor = conn.cursor()
    today_str = date.today().isoformat()

    cursor.execute("""
        SELECT b.*,
               u1.name as challenger_name, u1.avatar as challenger_avatar, u1.today_study_seconds as challenger_total,
               u2.name as opponent_name, u2.avatar as opponent_avatar, u2.today_study_seconds as opponent_total
        FROM battles b
        JOIN users u1 ON b.challenger_id = u1.id
        JOIN users u2 ON b.opponent_id = u2.id
        WHERE (b.challenger_id = ? OR b.opponent_id = ?) AND b.status IN ('ACTIVE', 'PENDING')
        ORDER BY b.id DESC LIMIT 1
    """, (user_id, user_id))
    battle = cursor.fetchone()

    if not battle:
        conn.close()
        return {"has_active_battle": False}

    b = dict(battle)
    is_challenger = (b["challenger_id"] == user_id)
    opponent_id = b["opponent_id"] if is_challenger else b["challenger_id"]
    
    # Attach head-to-head history
    b["h2h"] = get_h2h_record(cursor, user_id, opponent_id)
    b["has_active_battle"] = True
    b["my_id"] = user_id
    b["my_role"] = "challenger" if is_challenger else "opponent"
    b["my_seconds"] = b["challenger_seconds"] if is_challenger else b["opponent_seconds"]
    b["opp_seconds"] = b["opponent_seconds"] if is_challenger else b["challenger_seconds"]
    b["opp_id"] = opponent_id
    b["opp_name"] = b["opponent_name"] if is_challenger else b["challenger_name"]
    b["opp_avatar"] = b["opponent_avatar"] if is_challenger else b["challenger_avatar"]

    # Difference
    diff = b["my_seconds"] - b["opp_seconds"]
    b["diff_seconds"] = diff
    b["lead_status"] = "WINNING" if diff > 0 else ("LOSING" if diff < 0 else "TIED")

    conn.close()
    return b

# 9. Request a new 1:1 battle
@app.post("/api/battle/request")
def request_battle(data: dict = Body(...)):
    challenger_id = data.get("challenger_id", 1)
    opponent_id = data.get("opponent_id")

    if not opponent_id:
        raise HTTPException(status_code=400, detail="Opponent ID required")

    conn = get_db()
    cursor = conn.cursor()
    today_str = date.today().isoformat()
    now_str = datetime.now().isoformat()

    # Get challenger's and opponent's today study seconds so far
    cursor.execute("SELECT today_study_seconds FROM users WHERE id = ?", (challenger_id,))
    c_sec = cursor.fetchone()["today_study_seconds"]
    cursor.execute("SELECT today_study_seconds FROM users WHERE id = ?", (opponent_id,))
    o_sec = cursor.fetchone()["today_study_seconds"]

    # Create active battle
    cursor.execute("""
        INSERT INTO battles (challenger_id, opponent_id, battle_date, status, challenger_seconds, opponent_seconds, created_at)
        VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)
    """, (challenger_id, opponent_id, today_str, c_sec, o_sec, now_str))
    battle_id = cursor.lastrowid

    # Retrieve head-to-head
    h2h = get_h2h_record(cursor, challenger_id, opponent_id)

    conn.commit()
    conn.close()
    return {
        "success": True,
        "battle_id": battle_id,
        "h2h": h2h,
        "message": "대결이 시작되었습니다! 서로의 순공 시간이 실시간으로 대결에 반영됩니다."
    }

# 10. Finalize today's battle and update head-to-head records
@app.post("/api/battle/{battle_id}/finalize")
def finalize_battle(battle_id: int):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM battles WHERE id = ?", (battle_id,))
    battle = cursor.fetchone()
    if not battle:
        conn.close()
        raise HTTPException(status_code=404, detail="Battle not found")

    b = dict(battle)
    c_id = b["challenger_id"]
    o_id = b["opponent_id"]
    c_sec = b["challenger_seconds"]
    o_sec = b["opponent_seconds"]

    if c_sec > o_sec:
        winner_id = c_id
    elif o_sec > c_sec:
        winner_id = o_id
    else:
        winner_id = None # Draw

    # Update battle
    cursor.execute("""
        UPDATE battles 
        SET status = 'COMPLETED', winner_id = ?
        WHERE id = ?
    """, (winner_id, battle_id))

    # Update head-to-head table
    u1, u2 = min(c_id, o_id), max(c_id, o_id)
    cursor.execute("SELECT * FROM head_to_head WHERE user1_id = ? AND user2_id = ?", (u1, u2))
    row = cursor.fetchone()

    u1_win_add = 1 if winner_id == u1 else 0
    u2_win_add = 1 if winner_id == u2 else 0
    draw_add = 1 if winner_id is None else 0

    if row:
        cursor.execute("""
            UPDATE head_to_head
            SET user1_wins = user1_wins + ?,
                user2_wins = user2_wins + ?,
                draws = draws + ?
            WHERE user1_id = ? AND user2_id = ?
        """, (u1_win_add, u2_win_add, draw_add, u1, u2))
    else:
        cursor.execute("""
            INSERT INTO head_to_head (user1_id, user2_id, user1_wins, user2_wins, draws)
            VALUES (?, ?, ?, ?, ?)
        """, (u1, u2, u1_win_add, u2_win_add, draw_add))

    conn.commit()

    # Get updated record
    new_h2h = get_h2h_record(cursor, c_id, o_id)
    conn.close()

    return {
        "success": True,
        "winner_id": winner_id,
        "challenger_seconds": c_sec,
        "opponent_seconds": o_sec,
        "updated_h2h": new_h2h
    }

# 11. Study cafe & School Rankings
@app.get("/api/rankings")
def get_rankings(
    period: str = Query("today"), # "today" or "week"
    cafe_id: Optional[int] = Query(None),
    current_user_id: int = Query(1)
):
    conn = get_db()
    cursor = conn.cursor()

    order_col = "today_study_seconds" if period == "today" else "week_study_seconds"

    if cafe_id:
        cursor.execute(f"""
            SELECT u.id, u.name, u.school, u.grade, u.avatar, u.status, u.{order_col} as seconds,
                   c.name as cafe_name, c.branch as cafe_branch
            FROM users u
            LEFT JOIN study_cafes c ON u.current_cafe_id = c.id
            WHERE u.current_cafe_id = ?
            ORDER BY u.{order_col} DESC
        """, (cafe_id,))
    else:
        cursor.execute(f"""
            SELECT u.id, u.name, u.school, u.grade, u.avatar, u.status, u.{order_col} as seconds,
                   c.name as cafe_name, c.branch as cafe_branch
            FROM users u
            LEFT JOIN study_cafes c ON u.current_cafe_id = c.id
            ORDER BY u.{order_col} DESC
        """)

    rows = cursor.fetchall()
    rankings = []
    for rank, r in enumerate(rows, 1):
        item = dict(r)
        item["rank"] = rank
        item["is_me"] = (item["id"] == current_user_id)
        rankings.append(item)

    conn.close()
    return rankings

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

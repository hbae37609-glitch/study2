# -*- coding: utf-8 -*-
import sqlite3
import os
from datetime import date, datetime

DB_FILE = os.path.join(os.path.dirname(__file__), "studymate.db")

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        school TEXT NOT NULL,
        grade TEXT NOT NULL,
        avatar TEXT,
        status TEXT DEFAULT 'OFFLINE',  -- 'STUDYING', 'RESTING', 'OFFLINE'
        current_cafe_id INTEGER,
        today_study_seconds INTEGER DEFAULT 0,
        week_study_seconds INTEGER DEFAULT 0,
        status_message TEXT DEFAULT '',
        last_active TEXT
    );
    """)

    # 2. Study Cafes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS study_cafes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        branch TEXT,
        address TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        total_seats INTEGER DEFAULT 50,
        occupied_seats INTEGER DEFAULT 0,
        price_info TEXT,
        features TEXT
    );
    """)

    # 3. Friendships table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS friendships (
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
    );
    """)

    # 4. Head-to-Head record table (누적 상대 전적)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS head_to_head (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id INTEGER NOT NULL,
        user2_id INTEGER NOT NULL,
        user1_wins INTEGER DEFAULT 0,
        user2_wins INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        UNIQUE (user1_id, user2_id)
    );
    """)

    # 5. 1:1 Battles table (실제 대결 세션)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS battles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_id INTEGER NOT NULL,
        opponent_id INTEGER NOT NULL,
        battle_date TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE', -- 'PENDING', 'ACTIVE', 'COMPLETED', 'DECLINED'
        challenger_seconds INTEGER DEFAULT 0,
        opponent_seconds INTEGER DEFAULT 0,
        winner_id INTEGER,
        created_at TEXT NOT NULL
    );
    """)

    # 6. Study logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS study_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        cafe_id INTEGER,
        seconds INTEGER NOT NULL,
        log_date TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    conn.commit()

    # Seed mock data if empty
    cursor.execute("SELECT COUNT(*) FROM study_cafes")
    if cursor.fetchone()[0] == 0:
        seed_data(conn)

    conn.close()

def seed_data(conn):
    cursor = conn.cursor()

    # 1. Study Cafes (강남/대치/역삼 학원가 & 스카 밀집 지역)
    cafes = [
        (1, "작심 스터디카페", "역삼역점", "서울 강남구 테헤란로 152", 37.5006, 127.0364, 60, 24, "시간당 2,000원 / 4주 150,000원", "시디즈 의자, 스타벅스 원두 커피 무료, 듀얼모니터존"),
        (2, "초심 스터디카페", "강남역점", "서울 강남구 강남대로 382", 37.4979, 127.0276, 75, 38, "시간당 2,200원 / 4주 160,000원", "산소공급기, 안마의자 휴게존, 카페존/스터디존 분리"),
        (3, "시작 스터디카페", "대치한티점", "서울 강남구 도곡로 408", 37.4981, 127.0528, 50, 19, "시간당 2,000원 / 4주 140,000원", "클래식 음악존, 독서대/담요 무료 대여, 조용한 집중실"),
        (4, "토즈 스터디랩", "서초교대점", "서울 서초구 서초중앙로 125", 37.4925, 127.0142, 45, 15, "시간당 2,500원 / 4주 170,000원", "백색소음기, 모임 스터디룸, 개인 지정석")
    ]
    cursor.executemany("""
    INSERT INTO study_cafes (id, name, branch, address, lat, lng, total_seats, occupied_seats, price_info, features)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, cafes)

    # 2. Users (한국고등학교 학생들)
    now_str = datetime.now().isoformat()
    users = [
        # id, name, school, grade, avatar, status, current_cafe_id, today_study_seconds, week_study_seconds, status_message, last_active
        (1, "김민준(나)", "한국고등학교", "2학년 3반", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80", "STUDYING", 1, 12600, 78400, "오늘 모의고사 수학 1등급 간다 🔥", now_str), # 3시간 30분
        (2, "이서준", "한국고등학교", "2학년 3반", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80", "STUDYING", 1, 13800, 81200, "민준아 오늘은 내가 이긴다 ㅋㅋ ⚡", now_str), # 3시간 50분
        (3, "박도현", "한국고등학교", "2학년 1반", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80", "RESTING", 2, 9400, 54000, "잠깐 카페존에서 커피 한 잔 ☕", now_str),   # 2시간 36분
        (4, "최수아", "한국고등학교", "2학년 4반", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", "STUDYING", 3, 16200, 92000, "과탐 기출 3회독 완주 목표 📖", now_str),   # 4시간 30분
        (5, "정채원", "한국고등학교", "1학년 2반", "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80", "STUDYING", 1, 7200, 36000, "선배님들 따라 열공 중 ✍️", now_str),     # 2시간
        (6, "강지훈", "한국고등학교", "2학년 3반", "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80", "OFFLINE", None, 0, 24000, "집에서 쉬는 중 (오후에 갈 예정)", now_str),
        (7, "윤서연", "한국고등학교", "3학년 1반", "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80", "STUDYING", 2, 19800, 115000, "수능 D-DAY 빡공 모드 🔥", now_str)     # 5시간 30분
    ]
    cursor.executemany("""
    INSERT INTO users (id, name, school, grade, avatar, status, current_cafe_id, today_study_seconds, week_study_seconds, status_message, last_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, users)

    # 3. Friendships (민준의 친구들: 서준, 도현, 수아, 지훈)
    friendships = [
        (1, 2), (2, 1),
        (1, 3), (3, 1),
        (1, 4), (4, 1),
        (1, 6), (6, 1),
        (2, 3), (3, 2),
        (3, 4), (4, 3)
    ]
    cursor.executemany("INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)", friendships)

    # 4. Head-to-Head Records (영구 보존 상대 전적!)
    # 김민준(1) vs 이서준(2): 민준 3승, 서준 2패 (3승 2패)
    # 김민준(1) vs 박도현(3): 민준 1승, 도현 1승 (1승 1패)
    # 김민준(1) vs 최수아(4): 민준 2승, 수아 4승 (2승 4패)
    records = [
        (1, 2, 3, 2, 0),
        (1, 3, 1, 1, 0),
        (1, 4, 2, 4, 0),
        (2, 3, 2, 1, 0)
    ]
    cursor.executemany("""
    INSERT INTO head_to_head (user1_id, user2_id, user1_wins, user2_wins, draws)
    VALUES (?, ?, ?, ?, ?)
    """, records)

    # 5. Live Ongoing Battle for Today: 김민준(1) vs 이서준(2)
    today_str = date.today().isoformat()
    cursor.execute("""
    INSERT INTO battles (challenger_id, opponent_id, battle_date, status, challenger_seconds, opponent_seconds, created_at)
    VALUES (1, 2, ?, 'ACTIVE', 12600, 13800, ?)
    """, (today_str, now_str))

    conn.commit()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")

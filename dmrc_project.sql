-- ============================================================
-- DMRC PROJECT - COMPLETE FINAL DATABASE (WITH ALL FIXES)
-- Run this file fresh - drops old DB and creates new one
-- ============================================================

DROP DATABASE IF EXISTS dmrc_project;
CREATE DATABASE dmrc_project CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dmrc_project;

-- ============================================================
-- TABLE 1: USERS
-- ============================================================
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    unique_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    dob DATE NOT NULL,
    user_type ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_unique_id (unique_id),
    INDEX idx_phone (phone)
);

-- ============================================================
-- TABLE 2: METRO LINES
-- ============================================================
CREATE TABLE metro_lines (
    line_id INT PRIMARY KEY,
    line_name VARCHAR(50) NOT NULL,
    line_color VARCHAR(20) NOT NULL,
    line_color_hex VARCHAR(7) NOT NULL,
    stations_count INT DEFAULT 0,
    INDEX idx_line_name (line_name)
);

-- ============================================================
-- TABLE 3: STATIONS
-- ============================================================
CREATE TABLE stations (
    station_id INT PRIMARY KEY AUTO_INCREMENT,
    station_name VARCHAR(100) NOT NULL,
    line_id INT NOT NULL,
    sequence_number INT NOT NULL,
    is_interchange BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (line_id) REFERENCES metro_lines(line_id),
    INDEX idx_station_name (station_name),
    INDEX idx_line_seq (line_id, sequence_number)
);

-- ============================================================
-- TABLE 4: FARES
-- ============================================================
CREATE TABLE fares (
    fare_id INT PRIMARY KEY AUTO_INCREMENT,
    num_stations INT NOT NULL UNIQUE,
    fare_amount DECIMAL(6,2) NOT NULL,
    validity_hours INT NOT NULL,
    INDEX idx_num_stations (num_stations)
);

-- ============================================================
-- TABLE 5: WALLETS
-- ============================================================
CREATE TABLE wallets (
    wallet_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    balance DECIMAL(10,2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- ============================================================
-- TABLE 6: TICKETS (FIXED - includes Cancelled status + new columns)
-- ============================================================
CREATE TABLE tickets (
    ticket_id VARCHAR(30) PRIMARY KEY,
    user_id INT NOT NULL,
    from_station_id INT NOT NULL,
    to_station_id INT NOT NULL,
    num_stations INT NOT NULL,
    fare_amount DECIMAL(6,2) NOT NULL,
    validity_hours INT NOT NULL,
    journey_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP NULL,
    qr_code TEXT,
    ticket_status ENUM('Active', 'Used', 'Expired', 'Cancelled') DEFAULT 'Active',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (from_station_id) REFERENCES stations(station_id),
    FOREIGN KEY (to_station_id) REFERENCES stations(station_id),
    INDEX idx_user_id (user_id),
    INDEX idx_journey_date (journey_date),
    INDEX idx_ticket_status (ticket_status)
);

-- ============================================================
-- TABLE 7: WALLET TRANSACTIONS (NEW - was missing before!)
-- ============================================================
CREATE TABLE wallet_transactions (
    txn_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    transaction_type ENUM('recharge', 'debit', 'refund') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description VARCHAR(255),
    balance_before DECIMAL(10,2) DEFAULT 0,
    balance_after DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- ============================================================
-- DEFAULT ADMIN USER
-- ============================================================
INSERT INTO users (unique_id, full_name, phone, dob, user_type)
VALUES ('admi99992000', 'Admin', '9999999999', '2000-01-01', 'admin');

INSERT INTO wallets (user_id, balance) VALUES (1, 0);

-- ============================================================
-- METRO LINES (7 lines)
-- ============================================================
INSERT INTO metro_lines (line_id, line_name, line_color, line_color_hex, stations_count) VALUES
(1, 'Red Line',     'Red',     '#EF4444', 29),
(2, 'Blue Line',    'Blue',    '#3B82F6', 57),
(3, 'Yellow Line',  'Yellow',  '#EAB308', 37),
(4, 'Green Line',   'Green',   '#22C55E', 21),
(5, 'Violet Line',  'Violet',  '#A855F7', 34),
(6, 'Pink Line',    'Pink',    '#EC4899', 38),
(7, 'Magenta Line', 'Magenta', '#D946EF', 25);

-- ============================================================
-- RED LINE STATIONS (29 stations)
-- ============================================================
INSERT INTO stations VALUES (1,  'Rithala',                      1,  1,  0);
INSERT INTO stations VALUES (2,  'Rohini West',                  1,  2,  0);
INSERT INTO stations VALUES (3,  'Rohini East',                  1,  3,  0);
INSERT INTO stations VALUES (4,  'Pitampura',                    1,  4,  0);
INSERT INTO stations VALUES (5,  'Kohat Enclave',                1,  5,  0);
INSERT INTO stations VALUES (6,  'Netaji Subhash Place',         1,  6,  1);
INSERT INTO stations VALUES (7,  'Keshav Puram',                 1,  7,  0);
INSERT INTO stations VALUES (8,  'Kanhaiya Nagar',               1,  8,  0);
INSERT INTO stations VALUES (9,  'Inderlok',                     1,  9,  1);
INSERT INTO stations VALUES (10, 'Shastri Nagar',                1, 10,  0);
INSERT INTO stations VALUES (11, 'Pratap Nagar',                 1, 11,  0);
INSERT INTO stations VALUES (12, 'Pulbangash',                   1, 12,  0);
INSERT INTO stations VALUES (13, 'Tis Hazari',                   1, 13,  0);
INSERT INTO stations VALUES (14, 'Kashmere Gate',                1, 14,  1);
INSERT INTO stations VALUES (15, 'Shastri Park',                 1, 15,  0);
INSERT INTO stations VALUES (16, 'Seelampur',                    1, 16,  0);
INSERT INTO stations VALUES (17, 'Welcome',                      1, 17,  1);
INSERT INTO stations VALUES (18, 'Shahdara',                     1, 18,  0);
INSERT INTO stations VALUES (19, 'Mansarovar Park',              1, 19,  0);
INSERT INTO stations VALUES (20, 'Jhilmil',                      1, 20,  0);
INSERT INTO stations VALUES (21, 'Dilshad Garden',               1, 21,  0);
INSERT INTO stations VALUES (22, 'Shaheed Nagar',                1, 22,  0);
INSERT INTO stations VALUES (23, 'Raj Bagh',                     1, 23,  0);
INSERT INTO stations VALUES (24, 'Rajendra Nagar',               1, 24,  0);
INSERT INTO stations VALUES (25, 'Shyam Park',                   1, 25,  0);
INSERT INTO stations VALUES (26, 'Mohan Nagar',                  1, 26,  0);
INSERT INTO stations VALUES (27, 'Arthala',                      1, 27,  0);
INSERT INTO stations VALUES (28, 'Hindon River',                 1, 28,  0);
INSERT INTO stations VALUES (29, 'Shaheed Sthal (New Bus Adda)', 1, 29,  0);

-- ============================================================
-- BLUE LINE STATIONS (57 stations)
-- ============================================================
INSERT INTO stations VALUES (30, 'Dwarka Sector 21',     2,  1, 0);
INSERT INTO stations VALUES (31, 'Dwarka Sector 8',      2,  2, 0);
INSERT INTO stations VALUES (32, 'Dwarka Sector 9',      2,  3, 0);
INSERT INTO stations VALUES (33, 'Dwarka Sector 10',     2,  4, 0);
INSERT INTO stations VALUES (34, 'Dwarka Sector 11',     2,  5, 0);
INSERT INTO stations VALUES (35, 'Dwarka Sector 12',     2,  6, 0);
INSERT INTO stations VALUES (36, 'Dwarka Sector 13',     2,  7, 0);
INSERT INTO stations VALUES (37, 'Dwarka Sector 14',     2,  8, 0);
INSERT INTO stations VALUES (38, 'Dwarka',               2,  9, 0);
INSERT INTO stations VALUES (39, 'Dwarka Mor',           2, 10, 0);
INSERT INTO stations VALUES (40, 'Nawada',               2, 11, 0);
INSERT INTO stations VALUES (41, 'Uttam Nagar West',     2, 12, 0);
INSERT INTO stations VALUES (42, 'Uttam Nagar East',     2, 13, 0);
INSERT INTO stations VALUES (43, 'Janakpuri West',       2, 14, 1);
INSERT INTO stations VALUES (44, 'Janakpuri East',       2, 15, 0);
INSERT INTO stations VALUES (45, 'Tilak Nagar',          2, 16, 0);
INSERT INTO stations VALUES (46, 'Subhash Nagar',        2, 17, 0);
INSERT INTO stations VALUES (47, 'Tagore Garden',        2, 18, 0);
INSERT INTO stations VALUES (48, 'Rajouri Garden',       2, 19, 1);
INSERT INTO stations VALUES (49, 'Ramesh Nagar',         2, 20, 0);
INSERT INTO stations VALUES (50, 'Moti Nagar',           2, 21, 0);
INSERT INTO stations VALUES (51, 'Kirti Nagar',          2, 22, 1);
INSERT INTO stations VALUES (52, 'Shadipur',             2, 23, 0);
INSERT INTO stations VALUES (53, 'Patel Nagar',          2, 24, 0);
INSERT INTO stations VALUES (54, 'Rajendra Place',       2, 25, 0);
INSERT INTO stations VALUES (55, 'Karol Bagh',           2, 26, 0);
INSERT INTO stations VALUES (56, 'Jhandewalan',          2, 27, 0);
INSERT INTO stations VALUES (57, 'Ramakrishna Ashram Marg', 2, 28, 0);
INSERT INTO stations VALUES (58, 'Rajiv Chowk',          2, 29, 1);
INSERT INTO stations VALUES (59, 'Barakhamba Road',      2, 30, 0);
INSERT INTO stations VALUES (60, 'Mandi House',          2, 31, 1);
INSERT INTO stations VALUES (61, 'Supreme Court',        2, 32, 0);
INSERT INTO stations VALUES (62, 'Indraprastha',         2, 33, 0);
INSERT INTO stations VALUES (63, 'Yamuna Bank',          2, 34, 1);
INSERT INTO stations VALUES (64, 'Akshardham',           2, 35, 0);
INSERT INTO stations VALUES (65, 'Mayur Vihar Phase-1',  2, 36, 0);
INSERT INTO stations VALUES (66, 'Mayur Vihar Extension',2, 37, 0);
INSERT INTO stations VALUES (67, 'New Ashok Nagar',      2, 38, 0);
INSERT INTO stations VALUES (68, 'Noida Sector 15',      2, 39, 0);
INSERT INTO stations VALUES (69, 'Noida Sector 16',      2, 40, 0);
INSERT INTO stations VALUES (70, 'Noida Sector 18',      2, 41, 0);
INSERT INTO stations VALUES (71, 'Botanical Garden',     2, 42, 1);
INSERT INTO stations VALUES (72, 'Golf Course',          2, 43, 0);
INSERT INTO stations VALUES (73, 'Noida City Centre',    2, 44, 0);
INSERT INTO stations VALUES (74, 'Noida Sector 34',      2, 45, 0);
INSERT INTO stations VALUES (75, 'Noida Sector 52',      2, 46, 0);
INSERT INTO stations VALUES (76, 'Noida Sector 61',      2, 47, 0);
INSERT INTO stations VALUES (77, 'Noida Sector 59',      2, 48, 0);
INSERT INTO stations VALUES (78, 'Noida Sector 62',      2, 49, 0);
INSERT INTO stations VALUES (79, 'Noida Electronic City',2, 50, 0);
-- Branch: Yamuna Bank → Vaishali
INSERT INTO stations VALUES (80, 'Laxmi Nagar',          2, 51, 0);
INSERT INTO stations VALUES (81, 'Nirman Vihar',         2, 52, 0);
INSERT INTO stations VALUES (82, 'Preet Vihar',          2, 53, 0);
INSERT INTO stations VALUES (83, 'Karkarduma',           2, 54, 1);
INSERT INTO stations VALUES (84, 'Anand Vihar',          2, 55, 1);
INSERT INTO stations VALUES (85, 'Kaushambi',            2, 56, 0);
INSERT INTO stations VALUES (86, 'Vaishali',             2, 57, 0);

-- ============================================================
-- YELLOW LINE STATIONS (37 stations)
-- ============================================================
INSERT INTO stations VALUES (87,  'Samaypur Badli',        3,  1, 0);
INSERT INTO stations VALUES (88,  'Rohini Sector 18, 19',  3,  2, 0);
INSERT INTO stations VALUES (89,  'Haiderpur Badli Mor',   3,  3, 0);
INSERT INTO stations VALUES (90,  'Jahangirpuri',          3,  4, 0);
INSERT INTO stations VALUES (91,  'Adarsh Nagar',          3,  5, 0);
INSERT INTO stations VALUES (92,  'Azadpur',               3,  6, 1);
INSERT INTO stations VALUES (93,  'Model Town',            3,  7, 0);
INSERT INTO stations VALUES (94,  'GTB Nagar',             3,  8, 0);
INSERT INTO stations VALUES (95,  'Vishwa Vidyalaya',      3,  9, 0);
INSERT INTO stations VALUES (96,  'Vidhan Sabha',          3, 10, 0);
INSERT INTO stations VALUES (97,  'Civil Lines',           3, 11, 0);
INSERT INTO stations VALUES (98,  'Kashmere Gate',         3, 12, 1);
INSERT INTO stations VALUES (99,  'Chandni Chowk',         3, 13, 0);
INSERT INTO stations VALUES (100, 'Chawri Bazar',          3, 14, 0);
INSERT INTO stations VALUES (101, 'New Delhi',             3, 15, 0);
INSERT INTO stations VALUES (102, 'Rajiv Chowk',          3, 16, 1);
INSERT INTO stations VALUES (103, 'Patel Chowk',          3, 17, 0);
INSERT INTO stations VALUES (104, 'Central Secretariat',  3, 18, 1);
INSERT INTO stations VALUES (105, 'Udyog Bhawan',         3, 19, 0);
INSERT INTO stations VALUES (106, 'Lok Kalyan Marg',      3, 20, 0);
INSERT INTO stations VALUES (107, 'Jor Bagh',             3, 21, 0);
INSERT INTO stations VALUES (108, 'INA',                  3, 22, 1);
INSERT INTO stations VALUES (109, 'AIIMS',                3, 23, 0);
INSERT INTO stations VALUES (110, 'Green Park',           3, 24, 0);
INSERT INTO stations VALUES (111, 'Hauz Khas',            3, 25, 1);
INSERT INTO stations VALUES (112, 'Malviya Nagar',        3, 26, 0);
INSERT INTO stations VALUES (113, 'Saket',                3, 27, 0);
INSERT INTO stations VALUES (114, 'Qutub Minar',          3, 28, 0);
INSERT INTO stations VALUES (115, 'Chhatarpur',           3, 29, 0);
INSERT INTO stations VALUES (116, 'Sultanpur',            3, 30, 0);
INSERT INTO stations VALUES (117, 'Ghitorni',             3, 31, 0);
INSERT INTO stations VALUES (118, 'Arjan Garh',           3, 32, 0);
INSERT INTO stations VALUES (119, 'Guru Dronacharya',     3, 33, 0);
INSERT INTO stations VALUES (120, 'Sikanderpur',          3, 34, 0);
INSERT INTO stations VALUES (121, 'MG Road',              3, 35, 0);
INSERT INTO stations VALUES (122, 'IFFCO Chowk',          3, 36, 0);
INSERT INTO stations VALUES (123, 'HUDA City Centre',     3, 37, 0);

-- ============================================================
-- GREEN LINE STATIONS (21 stations)
-- ============================================================
INSERT INTO stations VALUES (124, 'Inderlok',                  4,  1, 1);
INSERT INTO stations VALUES (125, 'Ashok Park Main',           4,  2, 0);
INSERT INTO stations VALUES (126, 'Punjabi Bagh',              4,  3, 0);
INSERT INTO stations VALUES (127, 'Shivaji Park',              4,  4, 0);
INSERT INTO stations VALUES (128, 'Madipur',                   4,  5, 0);
INSERT INTO stations VALUES (129, 'Paschim Vihar East',        4,  6, 0);
INSERT INTO stations VALUES (130, 'Paschim Vihar West',        4,  7, 0);
INSERT INTO stations VALUES (131, 'Peera Garhi',               4,  8, 0);
INSERT INTO stations VALUES (132, 'Udyog Nagar',               4,  9, 0);
INSERT INTO stations VALUES (133, 'Surajmal Stadium',          4, 10, 0);
INSERT INTO stations VALUES (134, 'Nangloi',                   4, 11, 0);
INSERT INTO stations VALUES (135, 'Nangloi Railway Station',   4, 12, 0);
INSERT INTO stations VALUES (136, 'Rajdhani Park',             4, 13, 0);
INSERT INTO stations VALUES (137, 'Mundka',                    4, 14, 0);
INSERT INTO stations VALUES (138, 'Mundka Industrial Area',    4, 15, 0);
INSERT INTO stations VALUES (139, 'Ghevra Metro Station',      4, 16, 0);
INSERT INTO stations VALUES (140, 'Tikri Kalan',               4, 17, 0);
INSERT INTO stations VALUES (141, 'Tikri Border',              4, 18, 0);
INSERT INTO stations VALUES (142, 'Pandit Shree Ram Sharma',   4, 19, 0);
INSERT INTO stations VALUES (143, 'Bahadurgarh City',          4, 20, 0);
INSERT INTO stations VALUES (144, 'Brigadier Hoshiar Singh',   4, 21, 0);

-- ============================================================
-- VIOLET LINE STATIONS (34 stations)
-- ============================================================
INSERT INTO stations VALUES (145, 'Kashmere Gate',                  5,  1, 1);
INSERT INTO stations VALUES (146, 'Lal Qila',                       5,  2, 0);
INSERT INTO stations VALUES (147, 'Jama Masjid',                    5,  3, 0);
INSERT INTO stations VALUES (148, 'Delhi Gate',                     5,  4, 0);
INSERT INTO stations VALUES (149, 'ITO',                            5,  5, 0);
INSERT INTO stations VALUES (150, 'Mandi House',                    5,  6, 1);
INSERT INTO stations VALUES (151, 'Janpath',                        5,  7, 0);
INSERT INTO stations VALUES (152, 'Central Secretariat',            5,  8, 1);
INSERT INTO stations VALUES (153, 'Khan Market',                    5,  9, 0);
INSERT INTO stations VALUES (154, 'Jawaharlal Nehru Stadium',       5, 10, 0);
INSERT INTO stations VALUES (155, 'Jangpura',                       5, 11, 0);
INSERT INTO stations VALUES (156, 'Lajpat Nagar',                   5, 12, 1);
INSERT INTO stations VALUES (157, 'Moolchand',                      5, 13, 0);
INSERT INTO stations VALUES (158, 'Kailash Colony',                 5, 14, 0);
INSERT INTO stations VALUES (159, 'Nehru Place',                    5, 15, 0);
INSERT INTO stations VALUES (160, 'Kalkaji Mandir',                 5, 16, 1);
INSERT INTO stations VALUES (161, 'Govind Puri',                    5, 17, 0);
INSERT INTO stations VALUES (162, 'Harkesh Nagar Okhla',            5, 18, 0);
INSERT INTO stations VALUES (163, 'Jasola Apollo',                  5, 19, 0);
INSERT INTO stations VALUES (164, 'Sarita Vihar',                   5, 20, 0);
INSERT INTO stations VALUES (165, 'Mohan Estate',                   5, 21, 0);
INSERT INTO stations VALUES (166, 'Tughlakabad',                    5, 22, 0);
INSERT INTO stations VALUES (167, 'Badarpur Border',                5, 23, 0);
INSERT INTO stations VALUES (168, 'Sarai',                          5, 24, 0);
INSERT INTO stations VALUES (169, 'NHPC Chowk',                     5, 25, 0);
INSERT INTO stations VALUES (170, 'Mewala Maharajpur',              5, 26, 0);
INSERT INTO stations VALUES (171, 'Sector 28',                      5, 27, 0);
INSERT INTO stations VALUES (172, 'Badkal Mor',                     5, 28, 0);
INSERT INTO stations VALUES (173, 'Old Faridabad',                  5, 29, 0);
INSERT INTO stations VALUES (174, 'Neelam Chowk Ajronda',           5, 30, 0);
INSERT INTO stations VALUES (175, 'Bata Chowk',                     5, 31, 0);
INSERT INTO stations VALUES (176, 'Escorts Mujesar',                5, 32, 0);
INSERT INTO stations VALUES (177, 'Sant Surdas (Sihi)',             5, 33, 0);
INSERT INTO stations VALUES (178, 'Raja Nahar Singh (Ballabhgarh)', 5, 34, 0);

-- ============================================================
-- PINK LINE STATIONS (38 stations)
-- ============================================================
INSERT INTO stations VALUES (179, 'Majlis Park',                        6,  1, 0);
INSERT INTO stations VALUES (180, 'Azadpur',                            6,  2, 1);
INSERT INTO stations VALUES (181, 'Shalimar Bagh',                      6,  3, 0);
INSERT INTO stations VALUES (182, 'Netaji Subhash Place',               6,  4, 1);
INSERT INTO stations VALUES (183, 'Shakurpur',                          6,  5, 0);
INSERT INTO stations VALUES (184, 'Punjabi Bagh West',                  6,  6, 1);
INSERT INTO stations VALUES (185, 'ESI Hospital',                       6,  7, 0);
INSERT INTO stations VALUES (186, 'Rajouri Garden',                     6,  8, 1);
INSERT INTO stations VALUES (187, 'Maya Puri',                          6,  9, 0);
INSERT INTO stations VALUES (188, 'Naraina Vihar',                      6, 10, 0);
INSERT INTO stations VALUES (189, 'Delhi Cantt',                        6, 11, 0);
INSERT INTO stations VALUES (190, 'Durgabai Deshmukh South Campus',     6, 12, 0);
INSERT INTO stations VALUES (191, 'Sir Vishweshwaraiah Moti Bagh',      6, 13, 0);
INSERT INTO stations VALUES (192, 'Bhikaji Cama Place',                 6, 14, 0);
INSERT INTO stations VALUES (193, 'Sarojini Nagar',                     6, 15, 0);
INSERT INTO stations VALUES (194, 'INA',                                6, 16, 1);
INSERT INTO stations VALUES (195, 'South Extension',                    6, 17, 0);
INSERT INTO stations VALUES (196, 'Lajpat Nagar',                       6, 18, 1);
INSERT INTO stations VALUES (197, 'Vinobapuri',                         6, 19, 0);
INSERT INTO stations VALUES (198, 'Ashram',                             6, 20, 0);
INSERT INTO stations VALUES (199, 'Sarai Kale Khan Nizamuddin',         6, 21, 0);
INSERT INTO stations VALUES (200, 'Mayur Vihar Phase-1',                6, 22, 0);
INSERT INTO stations VALUES (201, 'Mayur Vihar Pocket-1',               6, 23, 0);
INSERT INTO stations VALUES (202, 'Trilokpuri Sanjay Lake',             6, 24, 0);
INSERT INTO stations VALUES (203, 'Vinod Nagar East',                   6, 25, 0);
INSERT INTO stations VALUES (204, 'Mandawali - West Vinod Nagar',       6, 26, 0);
INSERT INTO stations VALUES (205, 'IP Extension',                       6, 27, 0);
INSERT INTO stations VALUES (206, 'Anand Vihar',                        6, 28, 1);
INSERT INTO stations VALUES (207, 'Karkarduma',                         6, 29, 1);
INSERT INTO stations VALUES (208, 'Karkarduma Court',                   6, 30, 0);
INSERT INTO stations VALUES (209, 'Krishna Nagar',                      6, 31, 0);
INSERT INTO stations VALUES (210, 'East Azad Nagar',                    6, 32, 0);
INSERT INTO stations VALUES (211, 'Welcome',                            6, 33, 1);
INSERT INTO stations VALUES (212, 'Jaffrabad',                          6, 34, 0);
INSERT INTO stations VALUES (213, 'Maujpur-Babarpur',                   6, 35, 0);
INSERT INTO stations VALUES (214, 'Gokulpuri',                          6, 36, 0);
INSERT INTO stations VALUES (215, 'Johri Enclave',                      6, 37, 0);
INSERT INTO stations VALUES (216, 'Shiv Vihar',                         6, 38, 0);

-- ============================================================
-- MAGENTA LINE STATIONS (25 stations)
-- ============================================================
INSERT INTO stations VALUES (217, 'Janakpuri West',                  7,  1, 1);
INSERT INTO stations VALUES (218, 'Dabri Mor - Janakpuri South',     7,  2, 0);
INSERT INTO stations VALUES (219, 'Dashrath Puri',                   7,  3, 0);
INSERT INTO stations VALUES (220, 'Palam',                           7,  4, 0);
INSERT INTO stations VALUES (221, 'Sadar Bazar Cantonment',          7,  5, 0);
INSERT INTO stations VALUES (222, 'Terminal 1-IGI Airport',          7,  6, 0);
INSERT INTO stations VALUES (223, 'Shankar Vihar',                   7,  7, 0);
INSERT INTO stations VALUES (224, 'Vasant Vihar',                    7,  8, 0);
INSERT INTO stations VALUES (225, 'Munirka',                         7,  9, 0);
INSERT INTO stations VALUES (226, 'R.K. Puram',                      7, 10, 0);
INSERT INTO stations VALUES (227, 'IIT Delhi',                       7, 11, 0);
INSERT INTO stations VALUES (228, 'Hauz Khas',                       7, 12, 1);
INSERT INTO stations VALUES (229, 'Panchsheel Park',                 7, 13, 0);
INSERT INTO stations VALUES (230, 'Chirag Delhi',                    7, 14, 0);
INSERT INTO stations VALUES (231, 'Greater Kailash',                 7, 15, 0);
INSERT INTO stations VALUES (232, 'Nehru Enclave',                   7, 16, 0);
INSERT INTO stations VALUES (233, 'Kalkaji Mandir',                  7, 17, 1);
INSERT INTO stations VALUES (234, 'Okhla NSIC',                      7, 18, 0);
INSERT INTO stations VALUES (235, 'Sukhdev Vihar',                   7, 19, 0);
INSERT INTO stations VALUES (236, 'Jamia Millia Islamia',            7, 20, 0);
INSERT INTO stations VALUES (237, 'Okhla Vihar',                     7, 21, 0);
INSERT INTO stations VALUES (238, 'Jasola Vihar Shaheen Bagh',       7, 22, 0);
INSERT INTO stations VALUES (239, 'Kalindi Kunj',                    7, 23, 0);
INSERT INTO stations VALUES (240, 'Okhla Bird Sanctuary',            7, 24, 0);
INSERT INTO stations VALUES (241, 'Botanical Garden',                7, 25, 1);

-- ============================================================
-- FARES (1 to 60 stations)
-- ============================================================
INSERT INTO fares (num_stations, fare_amount, validity_hours) VALUES
(1,5,1),(2,10,1),(3,15,1),(4,20,1),(5,25,1),(6,30,1),(7,35,1),
(8,38,1),(9,41,1),(10,44,1),
(11,47,2),(12,50,2),(13,53,2),(14,56,2),(15,58,2),
(16,60,2),(17,62,2),(18,64,2),(19,66,2),(20,68,2),
(21,70,3),(22,70,3),(23,70,3),(24,70,3),(25,70,3),
(26,70,3),(27,70,3),(28,70,3),(29,70,3),(30,70,3),
(31,70,3),(32,70,3),(33,70,3),(34,70,3),(35,70,3),
(36,70,3),(37,70,3),(38,70,3),(39,70,3),(40,70,3),
(41,70,3),(42,70,3),(43,70,3),(44,70,3),(45,70,3),
(46,70,3),(47,70,3),(48,70,3),(49,70,3),(50,70,3),
(51,70,3),(52,70,3),(53,70,3),(54,70,3),(55,70,3),
(56,70,3),(57,70,3),(58,70,3),(59,70,3),(60,70,3);

-- ============================================================
-- TRIGGERS (FIXED VERSION)
-- ============================================================
DELIMITER //

-- Trigger 1: Check balance before ticket insert
CREATE TRIGGER before_ticket_purchase
BEFORE INSERT ON tickets
FOR EACH ROW
BEGIN
    DECLARE current_balance DECIMAL(10,2) DEFAULT 0;

    SELECT balance INTO current_balance
    FROM wallets
    WHERE user_id = NEW.user_id;

    IF current_balance IS NULL OR current_balance < NEW.fare_amount THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Insufficient wallet balance. Please recharge your wallet before booking.';
    END IF;
END//

-- Trigger 2: Deduct fare and log transaction after ticket insert
CREATE TRIGGER after_ticket_purchase
AFTER INSERT ON tickets
FOR EACH ROW
BEGIN
    DECLARE old_bal DECIMAL(10,2) DEFAULT 0;
    DECLARE new_bal DECIMAL(10,2) DEFAULT 0;

    SELECT balance INTO old_bal
    FROM wallets
    WHERE user_id = NEW.user_id;

    UPDATE wallets
    SET balance = balance - NEW.fare_amount
    WHERE user_id = NEW.user_id;

    SET new_bal = old_bal - NEW.fare_amount;

    INSERT INTO wallet_transactions
        (user_id, transaction_type, amount, description, balance_before, balance_after)
    VALUES
        (NEW.user_id, 'debit', NEW.fare_amount,
         CONCAT('Ticket booked: ', NEW.ticket_id),
         old_bal, new_bal);
END//

DELIMITER ;

-- ============================================================
-- ALL DONE! Summary:
-- Tables  : users, metro_lines, stations, fares,
--           wallets, tickets, wallet_transactions
-- Lines   : 7  |  Stations: 241
-- Admin   : Phone 9999999999 / DOB 2000-01-01
-- Fixes   : Cancelled status, cancellation columns,
--           wallet_transactions table, improved triggers
-- ============================================================
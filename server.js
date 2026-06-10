// /**
//  * DMRC METRO BOOKING SYSTEM - COMPLETE BACKEND V2
//  * UPDATED WITH:
//  * 1. Metro timing validation (6 AM - 11 PM only)
//  * 2. valid_until capped at 11 PM same day (no overflow to next day)
//  * 3. Recharge history API (for Stats tab)
//  */

// require('dotenv').config();
// const express = require('express');
// const mysql = require('mysql2/promise');
// const cors = require('cors');
// const QRCode = require('qrcode');
// const { spawn } = require('child_process');
// const fs = require('fs');
// const path = require('path');

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.use(cors());
// app.use(express.json());
// app.use(express.static('public'));

// // Database Connection Pool
// const pool = mysql.createPool({
//     host: process.env.DB_HOST || 'localhost',
//     user: process.env.DB_USER || 'root',
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME || 'dmrc_project',
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0
// });

// pool.getConnection()
//     .then(conn => {
//         console.log('✅ Database connected!');
//         conn.release();
//     })
//     .catch(err => console.error('❌ DB Error:', err.message));

// // =============================================================================
// // HELPER FUNCTIONS
// // =============================================================================

// function generateUniqueId(name, phone, dob) {
//     const namePart = name.toLowerCase().substring(0, 4).padEnd(4, 'x');
//     const phonePart = phone.substring(phone.length - 4);
//     const dobPart = new Date(dob).getFullYear().toString();
//     return namePart + phonePart + dobPart;
// }

// function calculateFare(numStations) {
//     let fare = 0;
//     if (numStations <= 7) fare = numStations * 5;
//     else if (numStations <= 14) fare = (7 * 5) + ((numStations - 7) * 3);
//     else fare = (7 * 5) + (7 * 3) + ((numStations - 14) * 2);
//     return Math.min(fare, 70);
// }

// function calculateValidity(numStations) {
//     if (numStations <= 10) return 1;
//     if (numStations <= 20) return 2;
//     return 3;
// }

// // =============================================================================
// // NEW HELPER: METRO TIMING FUNCTIONS
// // =============================================================================

// const METRO_OPEN_HOUR  = 6;   // 6:00 AM
// const METRO_CLOSE_HOUR = 23;  // 11:00 PM

// /**
//  * Check if current time is within metro operating hours (6 AM - 11 PM)
//  * AND check if ticket validity would cross 11 PM.
//  * If either fails → booking is BLOCKED entirely (ticket not created).
//  * Returns { allowed: true/false, message: string }
//  */
// function checkMetroTiming(validityHours = 0) {
//     const now = new Date();
//     const hour = now.getHours();

//     // Before 6 AM — metro not open yet
//     if (hour < METRO_OPEN_HOUR) {
//         return {
//             allowed: false,
//             message: `Metro services start at ${METRO_OPEN_HOUR}:00 AM. Current time: ${formatTime(now)}`
//         };
//     }

//     // At or after 11:00 PM — metro closed
//     if (hour >= METRO_CLOSE_HOUR) {
//         return {
//             allowed: false,
//             message: `Metro services end at 11:00 PM. Current time: ${formatTime(now)}. Please book tomorrow.`
//         };
//     }

//     // Check if ticket validity would go PAST 11:00 PM
//     // e.g. booking at 22:30 with 2hr validity → valid till 00:30 → BLOCK
//     if (validityHours > 0) {
//         const validUntil  = new Date(now.getTime() + validityHours * 60 * 60 * 1000);
//         const closingTime = new Date(now);
//         closingTime.setHours(METRO_CLOSE_HOUR, 0, 0, 0);

//         if (validUntil > closingTime) {
//             const minutesLeft = Math.floor((closingTime - now) / (1000 * 60));
//             return {
//                 allowed: false,
//                 message: `Cannot book — ticket validity (${validityHours} hr) would go past metro closing time (11:00 PM). Only ${minutesLeft} min left before closing. Please travel earlier.`,
//                 errorCode: 'METRO_CLOSING_SOON'
//             };
//         }
//     }

//     return { allowed: true, message: 'OK' };
// }

// /**
//  * Calculate valid_until — simple now + validityHours.
//  * Timing check is already done before this is called so no overflow possible.
//  */
// function calculateValidUntil(validityHours) {
//     const now = new Date();
//     return new Date(now.getTime() + validityHours * 60 * 60 * 1000);
// }

// function formatTime(date) {
//     return date.toLocaleTimeString('en-IN', {
//         hour: '2-digit',
//         minute: '2-digit',
//         hour12: true
//     });
// }

// // =============================================================================
// // SMART ROUTE FINDING - DUAL ROUTES (MIN INTERCHANGE + MIN STATIONS)
// // =============================================================================

// async function findRoute(fromId, toId) {
//     try {
//         const [allStations] = await pool.query(`
//             SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
//             FROM stations s
//             JOIN metro_lines ml ON s.line_id = ml.line_id
//             ORDER BY s.line_id, s.sequence_number
//         `);

//         const from = allStations.find(s => s.station_id == fromId);
//         const to = allStations.find(s => s.station_id == toId);

//         if (!from || !to) throw new Error('Invalid stations');

//         if (from.line_id === to.line_id) {
//             return await getDirectRoute(from, to);
//         }

//         const graph = buildMetroGraph(allStations);

//         const minInterchangePath = dijkstra(graph, fromId, toId, allStations, 'min_interchange');
//         const minStationsPath    = dijkstra(graph, fromId, toId, allStations, 'min_stations');

//         const route1 = buildRouteDetails(minInterchangePath, allStations);
//         const route2 = buildRouteDetails(minStationsPath, allStations);

//         return {
//             routes: [route1, route2],
//             hasMultipleOptions: true
//         };

//     } catch (error) {
//         console.error('Route error:', error);
//         throw error;
//     }
// }

// function buildRouteDetails(path, allStations) {
//     if (!path || path.length === 0) return null;

//     const route = [];
//     const interchanges = [];

//     for (let i = 0; i < path.length; i++) {
//         const station = allStations.find(s => s.station_id == path[i]);
//         route.push(station);

//         if (i > 0 && i < path.length - 1) {
//             const prev = allStations.find(s => s.station_id == path[i - 1]);
//             const next = allStations.find(s => s.station_id == path[i + 1]);
//             if (prev.line_id !== next.line_id) {
//                 interchanges.push(station.station_name);
//             }
//         }
//     }

//     return {
//         route,
//         numStations: route.length - 1,
//         interchanges,
//         isDirect: false
//     };
// }

// function buildMetroGraph(stations) {
//     const graph = {};
//     stations.forEach(s => { graph[s.station_id] = []; });

//     const lineStations = {};
//     stations.forEach(s => {
//         if (!lineStations[s.line_id]) lineStations[s.line_id] = [];
//         lineStations[s.line_id].push(s);
//     });

//     Object.keys(lineStations).forEach(lineId => {
//         lineStations[lineId].sort((a, b) => a.sequence_number - b.sequence_number);
//     });

//     Object.values(lineStations).forEach(line => {
//         for (let i = 0; i < line.length - 1; i++) {
//             const cur  = line[i];
//             const next = line[i + 1];
//             graph[cur.station_id].push({ to: next.station_id, stationCost: 1, interchangeCost: 0 });
//             graph[next.station_id].push({ to: cur.station_id, stationCost: 1, interchangeCost: 0 });
//         }
//     });

//     const byName = {};
//     stations.forEach(s => {
//         if (!byName[s.station_name]) byName[s.station_name] = [];
//         byName[s.station_name].push(s);
//     });

//     Object.values(byName).forEach(same => {
//         if (same.length > 1) {
//             for (let i = 0; i < same.length; i++) {
//                 for (let j = i + 1; j < same.length; j++) {
//                     graph[same[i].station_id].push({ to: same[j].station_id, stationCost: 0, interchangeCost: 1 });
//                     graph[same[j].station_id].push({ to: same[i].station_id, stationCost: 0, interchangeCost: 1 });
//                 }
//             }
//         }
//     });

//     return graph;
// }

// function dijkstra(graph, startId, endId, allStations, mode) {
//     const distances = {};
//     const previous  = {};
//     const unvisited = new Set();

//     Object.keys(graph).forEach(nodeId => {
//         distances[nodeId] = Infinity;
//         previous[nodeId]  = null;
//         unvisited.add(parseInt(nodeId));
//     });

//     distances[startId] = 0;

//     while (unvisited.size > 0) {
//         let current = null;
//         let minDist = Infinity;

//         unvisited.forEach(nodeId => {
//             if (distances[nodeId] < minDist) {
//                 minDist = distances[nodeId];
//                 current = nodeId;
//             }
//         });

//         if (current === null || current == endId) break;
//         unvisited.delete(current);

//         (graph[current] || []).forEach(edge => {
//             if (unvisited.has(edge.to)) {
//                 const edgeCost = mode === 'min_interchange'
//                     ? edge.stationCost + (edge.interchangeCost * 20)
//                     : edge.stationCost + (edge.interchangeCost * 0.5);

//                 const newDist = distances[current] + edgeCost;
//                 if (newDist < distances[edge.to]) {
//                     distances[edge.to] = newDist;
//                     previous[edge.to]  = current;
//                 }
//             }
//         });
//     }

//     const path = [];
//     let cur = endId;
//     while (cur !== null) {
//         path.unshift(cur);
//         cur = previous[cur];
//     }

//     return path[0] != startId ? null : path;
// }

// async function getDirectRoute(from, to) {
//     const [route] = await pool.query(`
//         SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
//         FROM stations s
//         JOIN metro_lines ml ON s.line_id = ml.line_id
//         WHERE s.line_id = ?
//           AND s.sequence_number BETWEEN ? AND ?
//         ORDER BY s.sequence_number ${from.sequence_number > to.sequence_number ? 'DESC' : 'ASC'}
//     `, [
//         from.line_id,
//         Math.min(from.sequence_number, to.sequence_number),
//         Math.max(from.sequence_number, to.sequence_number)
//     ]);

//     return {
//         routes: [{
//             route,
//             numStations: route.length - 1,
//             interchanges: [],
//             isDirect: true
//         }],
//         hasMultipleOptions: false
//     };
// }

// // =============================================================================
// // AUTH APIs
// // =============================================================================

// app.post('/api/auth/register', async (req, res) => {
//     try {
//         const { full_name, phone, dob } = req.body;

//         if (!full_name || !phone || !dob) {
//             return res.status(400).json({ success: false, error: 'All fields required' });
//         }

//         const [existing] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
//         if (existing.length > 0) {
//             return res.status(400).json({ success: false, error: 'Phone number already registered' });
//         }

//         const unique_id = generateUniqueId(full_name, phone, dob);

//         await pool.query(
//             'INSERT INTO users (unique_id, full_name, phone, dob, user_type) VALUES (?, ?, ?, ?, ?)',
//             [unique_id, full_name, phone, dob, 'user']
//         );

//         const [newUser] = await pool.query(
//             'SELECT user_id, unique_id, full_name, phone, user_type FROM users WHERE unique_id = ?',
//             [unique_id]
//         );

//         await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [newUser[0].user_id]);

//         res.json({ success: true, message: 'Registration successful', data: newUser[0] });

//     } catch (error) {
//         console.error('Registration error:', error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.post('/api/auth/login', async (req, res) => {
//     try {
//         const { phone, dob } = req.body;

//         if (!phone || !dob) {
//             return res.status(400).json({ success: false, error: 'Phone and DOB required' });
//         }

//         const [users] = await pool.query(
//             'SELECT user_id, unique_id, full_name, phone, user_type FROM users WHERE phone = ? AND dob = ?',
//             [phone, dob]
//         );

//         if (users.length === 0) {
//             return res.status(401).json({ success: false, error: 'Invalid credentials' });
//         }

//         const userId = users[0].user_id;
//         const [existingWallet] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);

//         if (existingWallet.length === 0) {
//             await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
//         }

//         res.json({ success: true, message: 'Login successful', data: users[0] });

//     } catch (error) {
//         console.error('Login error:', error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // STATION APIs
// // =============================================================================

// app.get('/api/stations', async (req, res) => {
//     try {
//         const [stations] = await pool.query(`
//             SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
//             FROM stations s
//             JOIN metro_lines ml ON s.line_id = ml.line_id
//             ORDER BY s.line_id, s.sequence_number
//         `);
//         res.json({ success: true, data: stations });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.get('/api/stations/search', async (req, res) => {
//     try {
//         const { query } = req.query;
//         if (!query || query.length < 2) {
//             return res.json({ success: true, data: [] });
//         }

//         const [stations] = await pool.query(`
//             SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
//             FROM stations s
//             JOIN metro_lines ml ON s.line_id = ml.line_id
//             WHERE s.station_name LIKE ?
//             ORDER BY s.station_name
//             LIMIT 10
//         `, [`%${query}%`]);

//         res.json({ success: true, data: stations });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // ROUTE & FARE APIs
// // =============================================================================

// app.post('/api/calculate', async (req, res) => {
//     try {
//         const { from_station_id, to_station_id } = req.body;

//         if (!from_station_id || !to_station_id) {
//             return res.status(400).json({ success: false, error: 'Both stations required' });
//         }

//         if (from_station_id === to_station_id) {
//             return res.status(400).json({ success: false, error: 'Same station' });
//         }

//         const routeInfo = await findRoute(from_station_id, to_station_id);

//         const routesWithDetails = routeInfo.routes.map(route => {
//             const fareAmount    = calculateFare(route.numStations);
//             const validityHours = calculateValidity(route.numStations);
//             return { ...route, fareAmount, validityHours };
//         });

//         res.json({
//             success: true,
//             data: { routes: routesWithDetails, hasMultipleOptions: routeInfo.hasMultipleOptions }
//         });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // WALLET APIs
// // =============================================================================

// app.get('/api/wallet/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const [wallet] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);

//         if (wallet.length === 0) return res.json({ success: true, balance: 0 });

//         res.json({ success: true, balance: parseFloat(wallet[0].balance) });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.post('/api/wallet/recharge', async (req, res) => {
//     try {
//         const { user_id, amount } = req.body;

//         if (!user_id || !amount || amount < 100) {
//             return res.status(400).json({ success: false, error: 'Invalid amount (min ₹100)' });
//         }

//         const [oldWallet] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user_id]);
//         const oldBalance = parseFloat(oldWallet[0].balance);

//         await pool.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [amount, user_id]);

//         const [wallet] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user_id]);
//         const newBalance = parseFloat(wallet[0].balance);

//         // Log recharge transaction
//         try {
//             await pool.query(
//                 `INSERT INTO wallet_transactions 
//                  (user_id, transaction_type, amount, description, balance_before, balance_after) 
//                  VALUES (?, 'recharge', ?, 'Wallet recharge', ?, ?)`,
//                 [user_id, amount, oldBalance, newBalance]
//             );
//         } catch (e) {
//             console.log('Transaction log skipped:', e.message);
//         }

//         res.json({ success: true, message: `Recharged ₹${amount}`, balance: newBalance });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // WALLET TRANSACTION HISTORY
// // (Used by Stats tab → Recharge History section)
// // =============================================================================

// app.get('/api/wallet/transactions/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;

//         const [transactions] = await pool.query(`
//             SELECT 
//                 txn_id,
//                 transaction_type,
//                 amount,
//                 description,
//                 balance_before,
//                 balance_after,
//                 created_at
//             FROM wallet_transactions
//             WHERE user_id = ?
//             ORDER BY created_at DESC
//             LIMIT 50
//         `, [userId]);

//         res.json({ success: true, data: transactions });
//     } catch (error) {
//         // Table might not exist in older installs
//         res.json({ success: true, data: [] });
//     }
// });

// // =============================================================================
// // TICKET APIs — WITH METRO TIMING CHECK + VALID_UNTIL CAP
// // =============================================================================

// app.post('/api/ticket/generate', async (req, res) => {
//     try {
//         const { user_id, from_station_id, to_station_id } = req.body;

//         if (!user_id || !from_station_id || !to_station_id) {
//             return res.status(400).json({ success: false, error: 'Missing required fields' });
//         }

//         // ── Metro timing check (basic: open hours) ───────────────
//         const basicTimingCheck = checkMetroTiming();
//         if (!basicTimingCheck.allowed) {
//             return res.status(400).json({
//                 success: false,
//                 error: basicTimingCheck.message,
//                 errorCode: basicTimingCheck.errorCode || 'METRO_CLOSED'
//             });
//         }

//         const routeInfo = await findRoute(from_station_id, to_station_id);
//         const selectedRoute = routeInfo.routes[0];

//         const fareAmount    = calculateFare(selectedRoute.numStations);
//         const validityHours = calculateValidity(selectedRoute.numStations);

//         // ── Metro timing check (validity overflow: e.g. 22:59 + 2hr) ──
//         const validityCheck = checkMetroTiming(validityHours);
//         if (!validityCheck.allowed) {
//             return res.status(400).json({
//                 success: false,
//                 error: validityCheck.message,
//                 errorCode: validityCheck.errorCode || 'METRO_CLOSING_SOON'
//             });
//         }

//         const ticketId = `DMRC${Date.now()}${Math.floor(Math.random() * 1000)}`;
//         const qrCode = await QRCode.toDataURL(JSON.stringify({
//             ticket_id: ticketId,
//             from: selectedRoute.route[0].station_name,
//             to:   selectedRoute.route[selectedRoute.route.length - 1].station_name,
//             fare: fareAmount
//         }));

//         const validUntil = calculateValidUntil(validityHours);

//         try {
//             await pool.query(`
//                 INSERT INTO tickets 
//                     (ticket_id, user_id, from_station_id, to_station_id, num_stations,
//                      fare_amount, validity_hours, valid_until, qr_code)
//                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//             `, [
//                 ticketId, user_id, from_station_id, to_station_id,
//                 selectedRoute.numStations, fareAmount, validityHours, validUntil, qrCode
//             ]);
//         } catch (dbError) {
//             if (dbError.sqlState === '45000') {
//                 return res.status(400).json({ success: false, error: dbError.message });
//             }
//             throw dbError;
//         }

//         const [newWallet] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user_id]);

//         res.json({
//             success: true,
//             data: {
//                 ticketId,
//                 route: selectedRoute.route,
//                 numStations: selectedRoute.numStations,
//                 fareAmount,
//                 validityHours,
//                 validUntil,
//                 qrCode,
//                 interchanges: selectedRoute.interchanges,
//                 newBalance: parseFloat(newWallet[0].balance),
//                 journeyDate: new Date()
//             }
//         });

//     } catch (error) {
//         console.error('Ticket generation error:', error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // TICKET REFUND API (10 MIN WINDOW)
// // =============================================================================

// app.post('/api/ticket/refund', async (req, res) => {
//     try {
//         const { ticket_id, user_id, reason } = req.body;

//         if (!ticket_id || !user_id || !reason) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Ticket ID, User ID, and Reason are required'
//             });
//         }

//         if (reason.trim().length < 10) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Reason must be at least 10 characters long'
//             });
//         }

//         const [tickets] = await pool.query(
//             'SELECT * FROM tickets WHERE ticket_id = ? AND user_id = ?',
//             [ticket_id, user_id]
//         );

//         if (tickets.length === 0) {
//             return res.status(404).json({ success: false, error: 'Ticket not found' });
//         }

//         const ticket = tickets[0];

//         if (ticket.ticket_status === 'Cancelled') {
//             return res.status(400).json({ success: false, error: 'Ticket is already cancelled' });
//         }
//         if (ticket.ticket_status === 'Used') {
//             return res.status(400).json({ success: false, error: 'Used tickets cannot be refunded' });
//         }
//         if (ticket.ticket_status === 'Expired') {
//             return res.status(400).json({ success: false, error: 'Expired tickets cannot be refunded' });
//         }

//         const bookingTime      = new Date(ticket.journey_date);
//         const currentTime      = new Date();
//         const timeDiffMinutes  = (currentTime - bookingTime) / (1000 * 60);

//         if (timeDiffMinutes > 10) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'Refund window expired. Tickets can only be refunded within 10 minutes of booking.',
//                 timeElapsed: Math.floor(timeDiffMinutes)
//             });
//         }

//         const cancellationFee = 5;
//         const refundAmount    = Math.max(0, ticket.fare_amount - cancellationFee);

//         const connection = await pool.getConnection();
//         try {
//             await connection.beginTransaction();

//             await connection.query(
//                 `UPDATE tickets 
//                  SET ticket_status = 'Cancelled', cancellation_reason = ?, cancelled_at = NOW()
//                  WHERE ticket_id = ?`,
//                 [reason, ticket_id]
//             );

//             await connection.query(
//                 'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
//                 [refundAmount, user_id]
//             );

//             try {
//                 const [walBefore] = await connection.query(
//                     'SELECT balance FROM wallets WHERE user_id = ?', [user_id]
//                 );
//                 const balBefore = parseFloat(walBefore[0].balance) - refundAmount;

//                 await connection.query(
//                     `INSERT INTO wallet_transactions 
//                      (user_id, transaction_type, amount, description, balance_before, balance_after)
//                      VALUES (?, 'refund', ?, ?, ?, ?)`,
//                     [user_id, refundAmount,
//                      `Refund for ticket ${ticket_id} - ${reason}`,
//                      balBefore, parseFloat(walBefore[0].balance)]
//                 );
//             } catch (e) {
//                 console.log('Refund transaction log skipped');
//             }

//             await connection.commit();

//             const [wallet] = await connection.query(
//                 'SELECT balance FROM wallets WHERE user_id = ?', [user_id]
//             );

//             res.json({
//                 success: true,
//                 message: 'Ticket refunded successfully',
//                 data: {
//                     ticketId: ticket_id,
//                     fareAmount: ticket.fare_amount,
//                     cancellationFee,
//                     refundAmount,
//                     newBalance: parseFloat(wallet[0].balance),
//                     cancelledAt: new Date()
//                 }
//             });

//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }

//     } catch (error) {
//         console.error('Refund error:', error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // CHECK REFUND ELIGIBILITY
// // =============================================================================

// app.get('/api/ticket/refund-status/:ticketId/:userId', async (req, res) => {
//     try {
//         const { ticketId, userId } = req.params;

//         const [tickets] = await pool.query(
//             'SELECT * FROM tickets WHERE ticket_id = ? AND user_id = ?',
//             [ticketId, userId]
//         );

//         if (tickets.length === 0) {
//             return res.status(404).json({ success: false, error: 'Ticket not found' });
//         }

//         const ticket = tickets[0];

//         const bookingTime        = new Date(ticket.journey_date);
//         const currentTime        = new Date();
//         const timeDiffMinutes    = (currentTime - bookingTime) / (1000 * 60);
//         const timeRemainingMinutes = Math.max(0, 10 - timeDiffMinutes);

//         const isEligible  = ticket.ticket_status === 'Active' && timeDiffMinutes <= 10;
//         const cancellationFee = 5;
//         const refundAmount = isEligible ? Math.max(0, ticket.fare_amount - cancellationFee) : 0;

//         res.json({
//             success: true,
//             data: {
//                 ticketId: ticket.ticket_id,
//                 status: ticket.ticket_status,
//                 fareAmount: ticket.fare_amount,
//                 isEligible,
//                 timeElapsedMinutes: Math.floor(timeDiffMinutes),
//                 timeRemainingMinutes: Math.floor(timeRemainingMinutes),
//                 cancellationFee,
//                 refundAmount,
//                 reason: !isEligible
//                     ? (ticket.ticket_status !== 'Active'
//                         ? `Ticket is ${ticket.ticket_status}`
//                         : 'Refund window expired (10 min limit)')
//                     : null
//             }
//         });

//     } catch (error) {
//         console.error('Refund status error:', error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // USER TICKET HISTORY
// // =============================================================================

// app.get('/api/tickets/history/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const { status, limit = 20 } = req.query;

//         // Auto-expire old tickets
//         await pool.query(`
//             UPDATE tickets 
//             SET ticket_status = 'Expired' 
//             WHERE ticket_status = 'Active' AND valid_until < NOW() AND user_id = ?
//         `, [userId]);

//         let query = `
//             SELECT t.*, 
//                    fs.station_name as from_station,
//                    ts.station_name as to_station,
//                    fs.line_id as from_line_id,
//                    ts.line_id as to_line_id,
//                    ml1.line_name as from_line_name,
//                    ml1.line_color_hex as from_line_color,
//                    ml2.line_name as to_line_name,
//                    ml2.line_color_hex as to_line_color
//             FROM tickets t
//             JOIN stations fs  ON t.from_station_id = fs.station_id
//             JOIN stations ts  ON t.to_station_id   = ts.station_id
//             JOIN metro_lines ml1 ON fs.line_id = ml1.line_id
//             JOIN metro_lines ml2 ON ts.line_id = ml2.line_id
//             WHERE t.user_id = ?
//         `;

//         const params = [userId];

//         if (status) {
//             query += ' AND t.ticket_status = ?';
//             params.push(status);
//         }

//         query += ' ORDER BY t.journey_date DESC LIMIT ?';
//         params.push(parseInt(limit));

//         const [tickets] = await pool.query(query, params);
//         res.json({ success: true, data: tickets });

//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // USER JOURNEY STATS
// // =============================================================================

// app.get('/api/user/stats/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;

//         const [stats] = await pool.query(`
//             SELECT 
//                 COUNT(*) as total_trips,
//                 SUM(fare_amount) as total_spent,
//                 SUM(num_stations) as total_stations
//             FROM tickets
//             WHERE user_id = ?
//         `, [userId]);

//         const [mostVisited] = await pool.query(`
//             SELECT s.station_name, COUNT(*) as visit_count
//             FROM tickets t
//             JOIN stations s ON t.to_station_id = s.station_id
//             WHERE t.user_id = ?
//             GROUP BY t.to_station_id
//             ORDER BY visit_count DESC
//             LIMIT 1
//         `, [userId]);

//         const [thisMonth] = await pool.query(`
//             SELECT 
//                 COUNT(*) as month_trips,
//                 SUM(fare_amount) as month_spent
//             FROM tickets
//             WHERE user_id = ?
//               AND MONTH(journey_date) = MONTH(CURDATE())
//               AND YEAR(journey_date) = YEAR(CURDATE())
//         `, [userId]);

//         res.json({
//             success: true,
//             data: {
//                 totalTrips:        stats[0].total_trips || 0,
//                 totalSpent:        parseFloat(stats[0].total_spent || 0),
//                 totalStations:     stats[0].total_stations || 0,
//                 mostVisitedStation: mostVisited[0]?.station_name || 'N/A',
//                 thisMonthTrips:    thisMonth[0].month_trips || 0,
//                 thisMonthSpent:    parseFloat(thisMonth[0].month_spent || 0)
//             }
//         });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // ADMIN APIs
// // =============================================================================

// app.get('/api/admin/tickets', async (req, res) => {
//     try {
//         const { limit = 10 } = req.query;

//         const [tickets] = await pool.query(`
//             SELECT t.*, u.full_name, u.phone,
//                    fs.station_name as from_station,
//                    ts.station_name as to_station
//             FROM tickets t
//             JOIN users u    ON t.user_id = u.user_id
//             JOIN stations fs ON t.from_station_id = fs.station_id
//             JOIN stations ts ON t.to_station_id   = ts.station_id
//             ORDER BY t.journey_date DESC
//             LIMIT ?
//         `, [parseInt(limit)]);

//         res.json({ success: true, data: tickets });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.get('/api/admin/revenue', async (req, res) => {
//     try {
//         const { period = 'today' } = req.query;

//         const conditions = {
//             today:     'DATE(journey_date) = CURDATE()',
//             yesterday: 'DATE(journey_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)',
//             month:     'MONTH(journey_date) = MONTH(CURDATE()) AND YEAR(journey_date) = YEAR(CURDATE())',
//             all:       '1=1'
//         };

//         const dateCondition = conditions[period] || '1=1';

//         const [revenue] = await pool.query(`
//             SELECT 
//                 COUNT(*) as total_tickets,
//                 SUM(fare_amount) as total_revenue,
//                 AVG(fare_amount) as avg_fare
//             FROM tickets
//             WHERE ${dateCondition}
//         `);

//         res.json({ success: true, data: revenue[0] });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.get('/api/admin/revenue/chart', async (req, res) => {
//     try {
//         const [chartData] = await pool.query(`
//             SELECT 
//                 DATE(journey_date) as date,
//                 COUNT(*) as tickets,
//                 SUM(fare_amount) as revenue
//             FROM tickets
//             WHERE journey_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
//             GROUP BY DATE(journey_date)
//             ORDER BY date ASC
//         `);

//         res.json({ success: true, data: chartData });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.get('/api/admin/top-routes', async (req, res) => {
//     try {
//         const { limit = 5 } = req.query;

//         const [routes] = await pool.query(`
//             SELECT 
//                 fs.station_name as from_station,
//                 ts.station_name as to_station,
//                 COUNT(*) as booking_count,
//                 SUM(t.fare_amount) as total_revenue
//             FROM tickets t
//             JOIN stations fs ON t.from_station_id = fs.station_id
//             JOIN stations ts ON t.to_station_id   = ts.station_id
//             GROUP BY t.from_station_id, t.to_station_id
//             ORDER BY booking_count DESC
//             LIMIT ?
//         `, [parseInt(limit)]);

//         res.json({ success: true, data: routes });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.get('/api/admin/top-travelers', async (req, res) => {
//     try {
//         const { limit = 5 } = req.query;

//         const [travelers] = await pool.query(`
//             SELECT 
//                 u.full_name, u.phone, u.unique_id,
//                 COUNT(t.ticket_id) as total_trips,
//                 SUM(t.fare_amount) as total_spent
//             FROM users u
//             LEFT JOIN tickets t ON u.user_id = t.user_id
//             WHERE u.user_type = 'user'
//             GROUP BY u.user_id
//             ORDER BY total_trips DESC
//             LIMIT ?
//         `, [parseInt(limit)]);

//         res.json({ success: true, data: travelers });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.post('/api/admin/station/add', async (req, res) => {
//     try {
//         const { station_name, line_id, sequence_number, is_interchange } = req.body;

//         if (!station_name || !line_id || !sequence_number) {
//             return res.status(400).json({ success: false, error: 'Missing required fields' });
//         }

//         await pool.query(
//             'INSERT INTO stations (station_name, line_id, sequence_number, is_interchange) VALUES (?, ?, ?, ?)',
//             [station_name, line_id, sequence_number, is_interchange || 0]
//         );

//         res.json({ success: true, message: 'Station added successfully' });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// app.get('/api/admin/lines', async (req, res) => {
//     try {
//         const [lines] = await pool.query('SELECT * FROM metro_lines ORDER BY line_id');
//         res.json({ success: true, data: lines });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // DOWNLOAD TICKET AS PDF
// // =============================================================================

// app.get('/api/ticket/download/:ticketId', async (req, res) => {
//     try {
//         const { ticketId } = req.params;

//         const [tickets] = await pool.query(`
//             SELECT t.*, u.full_name,
//                    fs.station_name as from_station,
//                    ts.station_name as to_station
//             FROM tickets t
//             JOIN users u     ON t.user_id = u.user_id
//             JOIN stations fs ON t.from_station_id = fs.station_id
//             JOIN stations ts ON t.to_station_id   = ts.station_id
//             WHERE t.ticket_id = ?
//         `, [ticketId]);

//         if (tickets.length === 0) {
//             return res.status(404).json({ success: false, error: 'Ticket not found' });
//         }

//         const ticket = tickets[0];
//         const routeInfo = await findRoute(ticket.from_station_id, ticket.to_station_id);

//         const fmt = (d) => new Date(d).toLocaleString('en-IN', {
//             day: 'numeric', month: 'short', year: 'numeric',
//             hour: '2-digit', minute: '2-digit'
//         });

//         const ticketData = {
//             ticket_id:     ticket.ticket_id,
//             from_station:  ticket.from_station,
//             to_station:    ticket.to_station,
//             fare_amount:   ticket.fare_amount,
//             journey_date:  fmt(ticket.journey_date),
//             valid_until:   fmt(ticket.valid_until),
//             validity_hours: ticket.validity_hours,
//             num_stations:  ticket.num_stations,
//             user_name:     ticket.full_name,
//             route:         routeInfo.routes[0].route,
//             qr_code_data:  ticket.qr_code
//         };

//         const pythonScript = path.join(__dirname, 'ticket_pdf_generator.py');
//         const tempDir      = path.join(__dirname, 'temp');
//         const outputPath   = path.join(tempDir, `ticket_${ticketId}.pdf`);
//         const dataPath     = path.join(tempDir, `ticket_data_${ticketId}.json`);

//         if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

//         fs.writeFileSync(dataPath, JSON.stringify(ticketData));

//         const python = spawn('python3', [pythonScript, dataPath, outputPath]);

//         python.on('close', (code) => {
//             if (code === 0 && fs.existsSync(outputPath)) {
//                 res.download(outputPath, `DMRC_Ticket_${ticketId}.pdf`, () => {
//                     try { fs.unlinkSync(dataPath); fs.unlinkSync(outputPath); } catch (e) {}
//                 });
//             } else {
//                 res.status(500).json({ success: false, error: 'PDF generation failed' });
//             }
//         });

//     } catch (error) {
//         console.error('Download error:', error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // =============================================================================
// // START SERVER
// // =============================================================================

// app.listen(PORT, () => {
//     console.log('\n' + '='.repeat(60));
//     console.log('🚇 DMRC COMPLETE SYSTEM V2 - SERVER STARTED');
//     console.log('='.repeat(60));
//     console.log(`📍 Server   : http://localhost:${PORT}`);
//     console.log(`💾 Database : ${process.env.DB_NAME || 'dmrc_project'}`);
//     console.log(`🕐 Metro    : ${METRO_OPEN_HOUR}:00 AM – ${METRO_CLOSE_HOUR}:00 PM`);
//     console.log(`🔐 Auth     : READY`);
//     console.log(`👨‍💼 Admin    : READY`);
//     console.log(`📊 Analytics: READY`);
//     console.log(`🎫 Tickets  : READY`);
//     console.log('='.repeat(60) + '\n');
// });

// process.on('SIGINT', async () => {
//     await pool.end();
//     process.exit(0);
// });

/**
 * DMRC METRO BOOKING SYSTEM - COMPLETE BACKEND V2
 * UPDATED WITH:
 * 1. Metro timing validation (6 AM - 11 PM only)
 * 2. valid_until capped at 11 PM same day (no overflow to next day)
 * 3. Recharge history API (for Stats tab)
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const QRCode = require('qrcode');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'dmrc_project',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then(conn => {
        console.log(' Database connected!');
        conn.release();
    })
    .catch(err => console.error(' DB Error:', err.message));

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateUniqueId(name, phone, dob) {
    const namePart = name.toLowerCase().substring(0, 4).padEnd(4, 'x');
    const phonePart = phone.substring(phone.length - 4);
    const dobPart = new Date(dob).getFullYear().toString();
    return namePart + phonePart + dobPart;
}

function calculateFare(numStations) {
    let fare = 0;
    if (numStations <= 7) fare = numStations * 5;
    else if (numStations <= 14) fare = (7 * 5) + ((numStations - 7) * 3);
    else fare = (7 * 5) + (7 * 3) + ((numStations - 14) * 2);
    return Math.min(fare, 70);
}

function calculateValidity(numStations) {
    if (numStations <= 10) return 1;
    if (numStations <= 20) return 2;
    return 3;
}

// =============================================================================
// NEW HELPER: METRO TIMING FUNCTIONS
// =============================================================================

const METRO_OPEN_HOUR  = 6;   // 6:00 AM
const METRO_CLOSE_HOUR = 23;  // 11:00 PM

/**
 * Check if current time is within metro operating hours (6 AM - 11 PM)
 * AND check if ticket validity would cross 11 PM.
 * If either fails → booking is BLOCKED entirely (ticket not created).
 * Returns { allowed: true/false, message: string }
 */
function checkMetroTiming(validityHours = 0) {
    const now = new Date();
    const hour = now.getHours();

    // Before 6 AM — metro not open yet
    if (hour < METRO_OPEN_HOUR) {
        return {
            allowed: false,
            message: `Metro services start at ${METRO_OPEN_HOUR}:00 AM. Current time: ${formatTime(now)}`
        };
    }

    // At or after 11:00 PM — metro closed
    if (hour >= METRO_CLOSE_HOUR) {
        return {
            allowed: false,
            message: `Metro services end at 11:00 PM. Current time: ${formatTime(now)}. Please book tomorrow.`
        };
    }

    // Check if ticket validity would go PAST 11:00 PM
    // e.g. booking at 22:30 with 2hr validity → valid till 00:30 → BLOCK
    if (validityHours > 0) {
        const validUntil  = new Date(now.getTime() + validityHours * 60 * 60 * 1000);
        const closingTime = new Date(now);
        closingTime.setHours(METRO_CLOSE_HOUR, 0, 0, 0);

        if (validUntil > closingTime) {
            const minutesLeft = Math.floor((closingTime - now) / (1000 * 60));
            return {
                allowed: false,
                message: `Cannot book — ticket validity (${validityHours} hr) would go past metro closing time (11:00 PM). Only ${minutesLeft} min left before closing. Please travel earlier.`,
                errorCode: 'METRO_CLOSING_SOON'
            };
        }
    }

    return { allowed: true, message: 'OK' };
}

/**
 * Calculate valid_until — simple now + validityHours.
 * Timing check is already done before this is called so no overflow possible.
 */
function calculateValidUntil(validityHours) {
    const now = new Date();
    return new Date(now.getTime() + validityHours * 60 * 60 * 1000);
}

function formatTime(date) {
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// =============================================================================
// SMART ROUTE FINDING - DUAL ROUTES (MIN INTERCHANGE + MIN STATIONS)
// =============================================================================

async function findRoute(fromId, toId) {
    try {
        const [allStations] = await pool.query(`
            SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
            FROM stations s
            JOIN metro_lines ml ON s.line_id = ml.line_id
            ORDER BY s.line_id, s.sequence_number
        `);

        const from = allStations.find(s => s.station_id == fromId);
        const to = allStations.find(s => s.station_id == toId);

        if (!from || !to) throw new Error('Invalid stations');

        if (from.line_id === to.line_id) {
            return await getDirectRoute(from, to);
        }

        const graph = buildMetroGraph(allStations);

        const minInterchangePath = dijkstra(graph, fromId, toId, allStations, 'min_interchange');
        const minStationsPath    = dijkstra(graph, fromId, toId, allStations, 'min_stations');

        const route1 = buildRouteDetails(minInterchangePath, allStations);
        const route2 = buildRouteDetails(minStationsPath, allStations);

        return {
            routes: [route1, route2],
            hasMultipleOptions: true
        };

    } catch (error) {
        console.error('Route error:', error);
        throw error;
    }
}

function buildRouteDetails(path, allStations) {
    if (!path || path.length === 0) return null;

    const route = [];
    const interchanges = [];
    const seenInterchanges = new Set(); // prevent duplicate names

    for (let i = 0; i < path.length; i++) {
        const station = allStations.find(s => s.station_id == path[i]);
        route.push(station);

        // FIX: An interchange is where YOU board a new line.
        // That means: current station's line_id is DIFFERENT from previous station's line_id.
        // We only push ONCE — at the station where the new line begins (not where old line ends).
        if (i > 0) {
            const prev = allStations.find(s => s.station_id == path[i - 1]);
            if (
                prev.line_id !== station.line_id &&          // line changed here
                !seenInterchanges.has(station.station_name)  // not already added
            ) {
                interchanges.push(station.station_name);
                seenInterchanges.add(station.station_name);
            }
        }
    }

    return {
        route,
        numStations: route.length - 1,
        interchanges,
        isDirect: false
    };
}

function buildMetroGraph(stations) {
    const graph = {};
    stations.forEach(s => { graph[s.station_id] = []; });

    const lineStations = {};
    stations.forEach(s => {
        if (!lineStations[s.line_id]) lineStations[s.line_id] = [];
        lineStations[s.line_id].push(s);
    });

    Object.keys(lineStations).forEach(lineId => {
        lineStations[lineId].sort((a, b) => a.sequence_number - b.sequence_number);
    });

    Object.values(lineStations).forEach(line => {
        for (let i = 0; i < line.length - 1; i++) {
            const cur  = line[i];
            const next = line[i + 1];
            graph[cur.station_id].push({ to: next.station_id, stationCost: 1, interchangeCost: 0 });
            graph[next.station_id].push({ to: cur.station_id, stationCost: 1, interchangeCost: 0 });
        }
    });

    const byName = {};
    stations.forEach(s => {
        if (!byName[s.station_name]) byName[s.station_name] = [];
        byName[s.station_name].push(s);
    });

    Object.values(byName).forEach(same => {
        if (same.length > 1) {
            for (let i = 0; i < same.length; i++) {
                for (let j = i + 1; j < same.length; j++) {
                    graph[same[i].station_id].push({ to: same[j].station_id, stationCost: 0, interchangeCost: 1 });
                    graph[same[j].station_id].push({ to: same[i].station_id, stationCost: 0, interchangeCost: 1 });
                }
            }
        }
    });

    return graph;
}

function dijkstra(graph, startId, endId, allStations, mode) {
    const distances = {};
    const previous  = {};
    const unvisited = new Set();

    Object.keys(graph).forEach(nodeId => {
        distances[nodeId] = Infinity;
        previous[nodeId]  = null;
        unvisited.add(parseInt(nodeId));
    });

    distances[startId] = 0;

    while (unvisited.size > 0) {
        let current = null;
        let minDist = Infinity;

        unvisited.forEach(nodeId => {
            if (distances[nodeId] < minDist) {
                minDist = distances[nodeId];
                current = nodeId;
            }
        });

        if (current === null || current == endId) break;
        unvisited.delete(current);

        (graph[current] || []).forEach(edge => {
            if (unvisited.has(edge.to)) {
                const edgeCost = mode === 'min_interchange'
                    ? edge.stationCost + (edge.interchangeCost * 20)
                    : edge.stationCost + (edge.interchangeCost * 0.5);

                const newDist = distances[current] + edgeCost;
                if (newDist < distances[edge.to]) {
                    distances[edge.to] = newDist;
                    previous[edge.to]  = current;
                }
            }
        });
    }

    const path = [];
    let cur = endId;
    while (cur !== null) {
        path.unshift(cur);
        cur = previous[cur];
    }

    return path[0] != startId ? null : path;
}

async function getDirectRoute(from, to) {
    const [route] = await pool.query(`
        SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
        FROM stations s
        JOIN metro_lines ml ON s.line_id = ml.line_id
        WHERE s.line_id = ?
          AND s.sequence_number BETWEEN ? AND ?
        ORDER BY s.sequence_number ${from.sequence_number > to.sequence_number ? 'DESC' : 'ASC'}
    `, [
        from.line_id,
        Math.min(from.sequence_number, to.sequence_number),
        Math.max(from.sequence_number, to.sequence_number)
    ]);

    return {
        routes: [{
            route,
            numStations: route.length - 1,
            interchanges: [],
            isDirect: true
        }],
        hasMultipleOptions: false
    };
}

// =============================================================================
// AUTH APIs
// =============================================================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { full_name, phone, dob } = req.body;

        if (!full_name || !phone || !dob) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }

        const [existing] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Phone number already registered' });
        }

        const unique_id = generateUniqueId(full_name, phone, dob);

        await pool.query(
            'INSERT INTO users (unique_id, full_name, phone, dob, user_type) VALUES (?, ?, ?, ?, ?)',
            [unique_id, full_name, phone, dob, 'user']
        );

        const [newUser] = await pool.query(
            'SELECT user_id, unique_id, full_name, phone, user_type FROM users WHERE unique_id = ?',
            [unique_id]
        );

        await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [newUser[0].user_id]);

        res.json({ success: true, message: 'Registration successful', data: newUser[0] });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, dob } = req.body;

        if (!phone || !dob) {
            return res.status(400).json({ success: false, error: 'Phone and DOB required' });
        }

        const [users] = await pool.query(
            'SELECT user_id, unique_id, full_name, phone, user_type FROM users WHERE phone = ? AND dob = ?',
            [phone, dob]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const userId = users[0].user_id;
        const [existingWallet] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);

        if (existingWallet.length === 0) {
            await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
        }

        res.json({ success: true, message: 'Login successful', data: users[0] });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// STATION APIs
// =============================================================================

app.get('/api/stations', async (req, res) => {
    try {
        const [stations] = await pool.query(`
            SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
            FROM stations s
            JOIN metro_lines ml ON s.line_id = ml.line_id
            ORDER BY s.line_id, s.sequence_number
        `);
        res.json({ success: true, data: stations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stations/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.length < 2) {
            return res.json({ success: true, data: [] });
        }

        const [stations] = await pool.query(`
            SELECT s.*, ml.line_name, ml.line_color, ml.line_color_hex
            FROM stations s
            JOIN metro_lines ml ON s.line_id = ml.line_id
            WHERE s.station_name LIKE ?
            ORDER BY s.station_name
            LIMIT 10
        `, [`%${query}%`]);

        res.json({ success: true, data: stations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// ROUTE & FARE APIs
// =============================================================================

app.post('/api/calculate', async (req, res) => {
    try {
        const { from_station_id, to_station_id } = req.body;

        if (!from_station_id || !to_station_id) {
            return res.status(400).json({ success: false, error: 'Both stations required' });
        }

        if (from_station_id === to_station_id) {
            return res.status(400).json({ success: false, error: 'Same station' });
        }

        const routeInfo = await findRoute(from_station_id, to_station_id);

        const routesWithDetails = routeInfo.routes.map(route => {
            const fareAmount    = calculateFare(route.numStations);
            const validityHours = calculateValidity(route.numStations);
            return { ...route, fareAmount, validityHours };
        });

        res.json({
            success: true,
            data: { routes: routesWithDetails, hasMultipleOptions: routeInfo.hasMultipleOptions }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// WALLET APIs
// =============================================================================

app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [wallet] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);

        if (wallet.length === 0) return res.json({ success: true, balance: 0 });

        res.json({ success: true, balance: parseFloat(wallet[0].balance) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/wallet/recharge', async (req, res) => {
    try {
        const { user_id, amount } = req.body;

        if (!user_id || !amount || amount < 100) {
            return res.status(400).json({ success: false, error: 'Invalid amount (min ₹100)' });
        }

        const [oldWallet] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user_id]);
        const oldBalance = parseFloat(oldWallet[0].balance);

        await pool.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [amount, user_id]);

        const [wallet] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user_id]);
        const newBalance = parseFloat(wallet[0].balance);

        // Log recharge transaction
        try {
            await pool.query(
                `INSERT INTO wallet_transactions 
                 (user_id, transaction_type, amount, description, balance_before, balance_after) 
                 VALUES (?, 'recharge', ?, 'Wallet recharge', ?, ?)`,
                [user_id, amount, oldBalance, newBalance]
            );
        } catch (e) {
            console.log('Transaction log skipped:', e.message);
        }

        res.json({ success: true, message: `Recharged ₹${amount}`, balance: newBalance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// WALLET TRANSACTION HISTORY
// (Used by Stats tab → Recharge History section)
// =============================================================================

app.get('/api/wallet/transactions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const [transactions] = await pool.query(`
            SELECT 
                txn_id,
                transaction_type,
                amount,
                description,
                balance_before,
                balance_after,
                created_at
            FROM wallet_transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `, [userId]);

        res.json({ success: true, data: transactions });
    } catch (error) {
        // Table might not exist in older installs
        res.json({ success: true, data: [] });
    }
});

// =============================================================================
// TICKET APIs — WITH METRO TIMING CHECK + VALID_UNTIL CAP
// =============================================================================

app.post('/api/ticket/generate', async (req, res) => {
    try {
        const { user_id, from_station_id, to_station_id } = req.body;

        if (!user_id || !from_station_id || !to_station_id) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // ── Metro timing check (basic: open hours) ───────────────
        const basicTimingCheck = checkMetroTiming();
        if (!basicTimingCheck.allowed) {
            return res.status(400).json({
                success: false,
                error: basicTimingCheck.message,
                errorCode: basicTimingCheck.errorCode || 'METRO_CLOSED'
            });
        }

        const routeInfo = await findRoute(from_station_id, to_station_id);
        const selectedRoute = routeInfo.routes[0];

        const fareAmount    = calculateFare(selectedRoute.numStations);
        const validityHours = calculateValidity(selectedRoute.numStations);

        // ── Metro timing check (validity overflow: e.g. 22:59 + 2hr) ──
        const validityCheck = checkMetroTiming(validityHours);
        if (!validityCheck.allowed) {
            return res.status(400).json({
                success: false,
                error: validityCheck.message,
                errorCode: validityCheck.errorCode || 'METRO_CLOSING_SOON'
            });
        }

        const ticketId = `DMRC${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const qrCode = await QRCode.toDataURL(JSON.stringify({
            ticket_id: ticketId,
            from: selectedRoute.route[0].station_name,
            to:   selectedRoute.route[selectedRoute.route.length - 1].station_name,
            fare: fareAmount
        }));

        const validUntil = calculateValidUntil(validityHours);

        try {
            await pool.query(`
                INSERT INTO tickets 
                    (ticket_id, user_id, from_station_id, to_station_id, num_stations,
                     fare_amount, validity_hours, valid_until, qr_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                ticketId, user_id, from_station_id, to_station_id,
                selectedRoute.numStations, fareAmount, validityHours, validUntil, qrCode
            ]);
        } catch (dbError) {
            if (dbError.sqlState === '45000') {
                return res.status(400).json({ success: false, error: dbError.message });
            }
            throw dbError;
        }

        const [newWallet] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user_id]);

        res.json({
            success: true,
            data: {
                ticketId,
                route: selectedRoute.route,
                numStations: selectedRoute.numStations,
                fareAmount,
                validityHours,
                validUntil,
                qrCode,
                interchanges: selectedRoute.interchanges,
                newBalance: parseFloat(newWallet[0].balance),
                journeyDate: new Date()
            }
        });

    } catch (error) {
        console.error('Ticket generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// TICKET REFUND API (10 MIN WINDOW)
// =============================================================================

app.post('/api/ticket/refund', async (req, res) => {
    try {
        const { ticket_id, user_id, reason } = req.body;

        if (!ticket_id || !user_id || !reason) {
            return res.status(400).json({
                success: false,
                error: 'Ticket ID, User ID, and Reason are required'
            });
        }

        if (reason.trim().length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Reason must be at least 10 characters long'
            });
        }

        const [tickets] = await pool.query(
            'SELECT * FROM tickets WHERE ticket_id = ? AND user_id = ?',
            [ticket_id, user_id]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = tickets[0];

        if (ticket.ticket_status === 'Cancelled') {
            return res.status(400).json({ success: false, error: 'Ticket is already cancelled' });
        }
        if (ticket.ticket_status === 'Used') {
            return res.status(400).json({ success: false, error: 'Used tickets cannot be refunded' });
        }
        if (ticket.ticket_status === 'Expired') {
            return res.status(400).json({ success: false, error: 'Expired tickets cannot be refunded' });
        }

        const bookingTime      = new Date(ticket.journey_date);
        const currentTime      = new Date();
        const timeDiffMinutes  = (currentTime - bookingTime) / (1000 * 60);

        if (timeDiffMinutes > 10) {
            return res.status(400).json({
                success: false,
                error: 'Refund window expired. Tickets can only be refunded within 10 minutes of booking.',
                timeElapsed: Math.floor(timeDiffMinutes)
            });
        }

        const cancellationFee = 5;
        const refundAmount    = Math.max(0, ticket.fare_amount - cancellationFee);

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `UPDATE tickets 
                 SET ticket_status = 'Cancelled', cancellation_reason = ?, cancelled_at = NOW()
                 WHERE ticket_id = ?`,
                [reason, ticket_id]
            );

            await connection.query(
                'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                [refundAmount, user_id]
            );

            try {
                const [walBefore] = await connection.query(
                    'SELECT balance FROM wallets WHERE user_id = ?', [user_id]
                );
                const balBefore = parseFloat(walBefore[0].balance) - refundAmount;

                await connection.query(
                    `INSERT INTO wallet_transactions 
                     (user_id, transaction_type, amount, description, balance_before, balance_after)
                     VALUES (?, 'refund', ?, ?, ?, ?)`,
                    [user_id, refundAmount,
                     `Refund for ticket ${ticket_id} - ${reason}`,
                     balBefore, parseFloat(walBefore[0].balance)]
                );
            } catch (e) {
                console.log('Refund transaction log skipped');
            }

            await connection.commit();

            const [wallet] = await connection.query(
                'SELECT balance FROM wallets WHERE user_id = ?', [user_id]
            );

            res.json({
                success: true,
                message: 'Ticket refunded successfully',
                data: {
                    ticketId: ticket_id,
                    fareAmount: ticket.fare_amount,
                    cancellationFee,
                    refundAmount,
                    newBalance: parseFloat(wallet[0].balance),
                    cancelledAt: new Date()
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// CHECK REFUND ELIGIBILITY
// =============================================================================

app.get('/api/ticket/refund-status/:ticketId/:userId', async (req, res) => {
    try {
        const { ticketId, userId } = req.params;

        const [tickets] = await pool.query(
            'SELECT * FROM tickets WHERE ticket_id = ? AND user_id = ?',
            [ticketId, userId]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = tickets[0];

        const bookingTime        = new Date(ticket.journey_date);
        const currentTime        = new Date();
        const timeDiffMinutes    = (currentTime - bookingTime) / (1000 * 60);
        const timeRemainingMinutes = Math.max(0, 10 - timeDiffMinutes);

        const isEligible  = ticket.ticket_status === 'Active' && timeDiffMinutes <= 10;
        const cancellationFee = 5;
        const refundAmount = isEligible ? Math.max(0, ticket.fare_amount - cancellationFee) : 0;

        res.json({
            success: true,
            data: {
                ticketId: ticket.ticket_id,
                status: ticket.ticket_status,
                fareAmount: ticket.fare_amount,
                isEligible,
                timeElapsedMinutes: Math.floor(timeDiffMinutes),
                timeRemainingMinutes: Math.floor(timeRemainingMinutes),
                cancellationFee,
                refundAmount,
                reason: !isEligible
                    ? (ticket.ticket_status !== 'Active'
                        ? `Ticket is ${ticket.ticket_status}`
                        : 'Refund window expired (10 min limit)')
                    : null
            }
        });

    } catch (error) {
        console.error('Refund status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// USER TICKET HISTORY
// =============================================================================

app.get('/api/tickets/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, limit = 20 } = req.query;

        // Auto-expire old tickets
        await pool.query(`
            UPDATE tickets 
            SET ticket_status = 'Expired' 
            WHERE ticket_status = 'Active' AND valid_until < NOW() AND user_id = ?
        `, [userId]);

        let query = `
            SELECT t.*, 
                   fs.station_name as from_station,
                   ts.station_name as to_station,
                   fs.line_id as from_line_id,
                   ts.line_id as to_line_id,
                   ml1.line_name as from_line_name,
                   ml1.line_color_hex as from_line_color,
                   ml2.line_name as to_line_name,
                   ml2.line_color_hex as to_line_color
            FROM tickets t
            JOIN stations fs  ON t.from_station_id = fs.station_id
            JOIN stations ts  ON t.to_station_id   = ts.station_id
            JOIN metro_lines ml1 ON fs.line_id = ml1.line_id
            JOIN metro_lines ml2 ON ts.line_id = ml2.line_id
            WHERE t.user_id = ?
        `;

        const params = [userId];

        if (status) {
            query += ' AND t.ticket_status = ?';
            params.push(status);
        }

        query += ' ORDER BY t.journey_date DESC LIMIT ?';
        params.push(parseInt(limit));

        const [tickets] = await pool.query(query, params);
        res.json({ success: true, data: tickets });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// USER JOURNEY STATS
// =============================================================================

app.get('/api/user/stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total_trips,
                SUM(fare_amount) as total_spent,
                SUM(num_stations) as total_stations
            FROM tickets
            WHERE user_id = ?
        `, [userId]);

        const [mostVisited] = await pool.query(`
            SELECT s.station_name, COUNT(*) as visit_count
            FROM tickets t
            JOIN stations s ON t.to_station_id = s.station_id
            WHERE t.user_id = ?
            GROUP BY t.to_station_id
            ORDER BY visit_count DESC
            LIMIT 1
        `, [userId]);

        const [thisMonth] = await pool.query(`
            SELECT 
                COUNT(*) as month_trips,
                SUM(fare_amount) as month_spent
            FROM tickets
            WHERE user_id = ?
              AND MONTH(journey_date) = MONTH(CURDATE())
              AND YEAR(journey_date) = YEAR(CURDATE())
        `, [userId]);

        res.json({
            success: true,
            data: {
                totalTrips:        stats[0].total_trips || 0,
                totalSpent:        parseFloat(stats[0].total_spent || 0),
                totalStations:     stats[0].total_stations || 0,
                mostVisitedStation: mostVisited[0]?.station_name || 'N/A',
                thisMonthTrips:    thisMonth[0].month_trips || 0,
                thisMonthSpent:    parseFloat(thisMonth[0].month_spent || 0)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// ADMIN APIs
// =============================================================================

app.get('/api/admin/tickets', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const [tickets] = await pool.query(`
            SELECT t.*, u.full_name, u.phone,
                   fs.station_name as from_station,
                   ts.station_name as to_station
            FROM tickets t
            JOIN users u    ON t.user_id = u.user_id
            JOIN stations fs ON t.from_station_id = fs.station_id
            JOIN stations ts ON t.to_station_id   = ts.station_id
            ORDER BY t.journey_date DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({ success: true, data: tickets });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/revenue', async (req, res) => {
    try {
        const { period = 'today' } = req.query;

        const conditions = {
            today:     'DATE(journey_date) = CURDATE()',
            yesterday: 'DATE(journey_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)',
            month:     'MONTH(journey_date) = MONTH(CURDATE()) AND YEAR(journey_date) = YEAR(CURDATE())',
            all:       '1=1'
        };

        const dateCondition = conditions[period] || '1=1';

        const [revenue] = await pool.query(`
            SELECT 
                COUNT(*) as total_tickets,
                SUM(fare_amount) as total_revenue,
                AVG(fare_amount) as avg_fare
            FROM tickets
            WHERE ${dateCondition}
        `);

        res.json({ success: true, data: revenue[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/revenue/chart', async (req, res) => {
    try {
        const [chartData] = await pool.query(`
            SELECT 
                DATE(journey_date) as date,
                COUNT(*) as tickets,
                SUM(fare_amount) as revenue
            FROM tickets
            WHERE journey_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(journey_date)
            ORDER BY date ASC
        `);

        res.json({ success: true, data: chartData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/top-routes', async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const [routes] = await pool.query(`
            SELECT 
                fs.station_name as from_station,
                ts.station_name as to_station,
                COUNT(*) as booking_count,
                SUM(t.fare_amount) as total_revenue
            FROM tickets t
            JOIN stations fs ON t.from_station_id = fs.station_id
            JOIN stations ts ON t.to_station_id   = ts.station_id
            GROUP BY t.from_station_id, t.to_station_id
            ORDER BY booking_count DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({ success: true, data: routes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/top-travelers', async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const [travelers] = await pool.query(`
            SELECT 
                u.full_name, u.phone, u.unique_id,
                COUNT(t.ticket_id) as total_trips,
                SUM(t.fare_amount) as total_spent
            FROM users u
            LEFT JOIN tickets t ON u.user_id = t.user_id
            WHERE u.user_type = 'user'
            GROUP BY u.user_id
            ORDER BY total_trips DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({ success: true, data: travelers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/station/add', async (req, res) => {
    try {
        const { station_name, line_id, sequence_number, is_interchange } = req.body;

        if (!station_name || !line_id || !sequence_number) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        await pool.query(
            'INSERT INTO stations (station_name, line_id, sequence_number, is_interchange) VALUES (?, ?, ?, ?)',
            [station_name, line_id, sequence_number, is_interchange || 0]
        );

        res.json({ success: true, message: 'Station added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/lines', async (req, res) => {
    try {
        const [lines] = await pool.query('SELECT * FROM metro_lines ORDER BY line_id');
        res.json({ success: true, data: lines });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// DOWNLOAD TICKET AS PDF
// =============================================================================

app.get('/api/ticket/download/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;

        const [tickets] = await pool.query(`
            SELECT t.*, u.full_name,
                   fs.station_name as from_station,
                   ts.station_name as to_station
            FROM tickets t
            JOIN users u     ON t.user_id = u.user_id
            JOIN stations fs ON t.from_station_id = fs.station_id
            JOIN stations ts ON t.to_station_id   = ts.station_id
            WHERE t.ticket_id = ?
        `, [ticketId]);

        if (tickets.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = tickets[0];
        const routeInfo = await findRoute(ticket.from_station_id, ticket.to_station_id);

        const fmt = (d) => new Date(d).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const ticketData = {
            ticket_id:     ticket.ticket_id,
            from_station:  ticket.from_station,
            to_station:    ticket.to_station,
            fare_amount:   ticket.fare_amount,
            journey_date:  fmt(ticket.journey_date),
            valid_until:   fmt(ticket.valid_until),
            validity_hours: ticket.validity_hours,
            num_stations:  ticket.num_stations,
            user_name:     ticket.full_name,
            route:         routeInfo.routes[0].route,
            qr_code_data:  ticket.qr_code
        };

        const pythonScript = path.join(__dirname, 'ticket_pdf_generator.py');
        const tempDir      = path.join(__dirname, 'temp');
        const outputPath   = path.join(tempDir, `ticket_${ticketId}.pdf`);
        const dataPath     = path.join(tempDir, `ticket_data_${ticketId}.json`);

        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        fs.writeFileSync(dataPath, JSON.stringify(ticketData));

        const python = spawn('python3', [pythonScript, dataPath, outputPath]);

        python.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                res.download(outputPath, `DMRC_Ticket_${ticketId}.pdf`, () => {
                    try { fs.unlinkSync(dataPath); fs.unlinkSync(outputPath); } catch (e) {}
                });
            } else {
                res.status(500).json({ success: false, error: 'PDF generation failed' });
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('DMRC COMPLETE SYSTEM V2 - SERVER STARTED');
    // olconse.log('='.repeat(60));
    console.log(`Server   : http://localhost:${PORT}`);
    // console.log(`💾 Database : ${process.env.DB_NAME || 'dmrc_project'}`);
    // console.log(`🕐 Metro    : ${METRO_OPEN_HOUR}:00 AM – ${METRO_CLOSE_HOUR}:00 PM`);
    // console.log(`🔐 Auth     : READY`);
    // console.log(`👨‍💼 Admin    : READY`);
    // console.log(`📊 Analytics: READY`);
    // console.log(`🎫 Tickets  : READY`);
    // console.log('='.repeat(60) + '\n');
});

process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
});
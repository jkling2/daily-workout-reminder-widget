// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: dumbbell;

// start of config ==========================

// sets the locale of the date
const locale = "de_DE";

// sets the name of the shortcut that redirects back to the homescreen (can be undefined)
const shortcutNameHomeScreen = "hs";

// how many and when do you want to start your workouts on each week day?
const startTimes = ["06:30", "14:00", "21:30"];

// workout time in min
const duration = 30;

// end of config ===========================

const WorkoutStates = {
  NOT_STARTED: 0,
  PENDING: 1,
  SKIPPED: 2,
  STARTED: 3,
  DONE: 4,
  TENNIS: 5,
  RUNNING: 6,
  BIKE: 7,
  WALKING: 8,
  
  properties: {	
	0: {name: "Not started", value: 0, color: Color.gray()},	
	1: {name: "Pending", value: 1, color: Color.darkGray()},	
	2: {name: "Skipped", value: 2, color: Color.red()},	
	3: {name: "Started", value: 3, color: Color.green()},
	4: {name: "Done", value: 4, color: Color.blue()},
	5: {name: "Tennis", value: 5, color: Color.blue(), text: "🎾"},
	6: {name: "Running", value: 6, color: Color.blue(), text: "🏃"},
	7: {name: "Bike", value: 7, color: Color.blue(), text: "🚴"},
	8: {name: "Walking", value: 8, color: Color.blue(), text: "🚶"},
  }
};

// initialize date formatter for time and date
const dft = new DateFormatter();
dft.useShortTimeStyle();
const df = new DateFormatter();
df.useMediumDateStyle();
df.locale = locale;

// load and initialize data
const fm = FileManager.iCloud();
const file = fm.joinPath(fm.documentsDirectory(), "dailyworkout.json");
const data = fm.fileExists(file) ? JSON.parse(fm.readString(file)) : JSON.parse("[]");
const todaysDate = df.date(df.string(new Date()));
const dataToday = (data.length > 0 && sameDay(todaysDate, df.date(data[0].date))) ? data[0] : JSON.parse("{}");

if (args.queryParameters.workoutCount && args.queryParameters.state) {
	// updates data based on query parameters
	dataToday.state[parseInt(args.queryParameters.workoutCount) - 1] = parseInt(args.queryParameters.state);
	updateAndSave();
	backToHomeScreen(shortcutNameHomeScreen);
	Script.complete();
} else if (config.runsInNotification) {
	// nothing to show (but notification options are shown)
	Script.complete();
} else if (args.notification) {
	// run from notification
	const notif = args.notification;
	const isStart = notif.userInfo["isStart"];
	workoutCount = notif.userInfo["workoutCount"];
	
	let ui = new UITable();
	ui.showSeparators = true;
	let rowH, rowQ, rowA, cell;

	rowH = new UITableRow();
	rowH.isHeader = true;
	rowH.height = 80;
	rowH.addText("WORKOUT").centerAligned();
	ui.addRow(rowH);

	rowQ = new UITableRow();
	rowQ.height = 60;
	if (isStart) {
		rowQ.addText("Workout started?").centerAligned();
	} else {
		rowQ.addText("Workout finished?").centerAligned();
	}
	ui.addRow(rowQ);
	
	rowA = new UITableRow();
	rowA.height = 40;
	ui.addRow(rowA);

	cell = rowA.addButton("Yes");
	cell.dismissOnTap = true;
	cell.centerAligned();
	cell.onTap = () => {
		dataToday.state[workoutCount - 1] = (isStart ? WorkoutStates.STARTED : WorkoutStates.DONE);
		updateAndSave();
	};
	cell = rowA.addButton("No");
	cell.dismissOnTap = false;
	cell.centerAligned();
	cell.onTap = () => {
		ui.removeRow(rowQ);
		ui.removeRow(rowA);
		rowQ = new UITableRow();
		rowQ.height = 60;
		rowQ.addText("Did you do a different workout?").centerAligned();
		ui.addRow(rowQ);
		rowA = new UITableRow();
		rowA.height = 40;
		ui.addRow(rowA);
		let buttonNo = rowA.addButton("No");
		buttonNo.centerAligned();
		buttonNo.dismissOnTap = true;
		buttonNo.onTap = () => {
			dataToday.state[workoutCount - 1] = (isStart ? WorkoutStates.NOT_STARTED : WorkoutStates.SKIPPED);
			updateAndSave();
		};
		for (let state in WorkoutStates) {
			state = WorkoutStates[state];
			if (state > WorkoutStates.DONE) {
				let row = new UITableRow();
				row.height = 40;
				let button = row.addButton(WorkoutStates.properties[state].name);
				button.centerAligned();
				button.dismissOnTap = true;
				button.onTap = () => {
					dataToday.state[workoutCount - 1] = state;
					updateAndSave();
				};
				ui.addRow(row);
			}
		}
		ui.reload();
	};

	await ui.present();
	backToHomeScreen(shortcutNameHomeScreen);
	Script.complete();
} else if (config.runsInApp || config.runsInWidget || config.runsFromHomeScreen){
	// build widget
	const widget = new ListWidget();
	widget.backgroundColor = Color.lightGray();

	// add workout history of past 5 days to widget
	const pastWorkouts = getDataForPastNDays(5);
	const contentStack = widget.addStack();
	contentStack.layoutVertically();
	for (workoutCount = 1; workoutCount <= startTimes.length; workoutCount++) {
		const stack = contentStack.addStack();
		stack.size = new Size(contentStack.size.width, 20);
		stack.addImage(SFSymbol.named(`${workoutCount}.circle.fill`).image);
		pastWorkouts.forEach((entry) => {
			const state = entry.state[workoutCount - 1];
			if (state <= WorkoutStates.DONE) {
				stack.addImage(SFSymbol.named(state >= WorkoutStates.STARTED ? "checkmark" : "xmark").image);		
			} else {
				stack.addText(WorkoutStates.properties[state].text);
			}
		});
	}
    contentStack.addSpacer(10);
	  
	if (isWeekDay(todaysDate)) {
		let dataChanged = false;
		// check if data for today exists and use it
		if (JSON.stringify(dataToday) === "{}") {
			// remove notifications from another day
			let pendingNotif = (await Notification.allPending()).filter(notif => notif.threadIdentifier === Script.name()).map(notif => notif.identifier);
			await Notification.removePending(pendingNotif);
			let deliveredNotif = (await Notification.allDelivered()).filter(notif => notif.threadIdentifier === Script.name()).map(notif => notif.identifier);
			await Notification.removeDelivered(deliveredNotif);
			// initialize data for today
			console.log("add new data for today");
			dataChanged = true;
			dataToday.date = df.string(todaysDate);
			dataToday.state = new Array(startTimes.length).fill(WorkoutStates.NOT_STARTED);
			data.unshift(dataToday);
			// schedule daily notifications
			for (let workoutCount = 1; workoutCount <= startTimes.length; workoutCount++) {
				// workout start: reminder that can just be dismissed - is dismissed with end
				await createNotification(getDateTime(startTimes[workoutCount - 1]), `Start your daily workout #${workoutCount} 💪`, workoutCount, true);
				// workout end: reminder that asks if workout was done
				let endWorkout = getDateTime(startTimes[workoutCount - 1]);
				endWorkout.setMinutes(endWorkout.getMinutes() + duration);
				await createNotification(endWorkout, `💪 Finish your workout #${workoutCount}`, workoutCount, false);
				
			}
		}
		// determine current workout count
		let currentWorkoutCount = startTimes.length;
		const date = new Date();
		for (let startIdx = 0; startIdx < startTimes.length; startIdx++) {
			if (date.getTime() < getDateTime(startTimes[startIdx]).getTime()) {
				currentWorkoutCount = startIdx;
				break;
			}
		}
		// update notifs
		pendingNotif = (await Notification.allPending()).filter(notif => notif.threadIdentifier === Script.name());
		deliveredNotif = (await Notification.allDelivered()).filter(notif => notif.threadIdentifier === Script.name());
		for (let workoutCount = 1; workoutCount <= currentWorkoutCount; workoutCount++) {
			if (dataToday.state && dataToday.state[workoutCount - 1] >= WorkoutStates.DONE) {
				// remove remaining notif for workout
				let pendingNotifsToRemove = pendingNotif.filter(notif => notif.userInfo["workoutCount"] === workoutCount).map(notif => notif.identifier);
				await Notification.removePending(pendingNotifsToRemove);
				let deliveredNotifsToRemove = deliveredNotif.filter(notif => notif.userInfo["workoutCount"] === workoutCount).map(notif => notif.identifier);
				await Notification.removeDelivered(deliveredNotifsToRemove);
			} else if (deliveredNotif.some(notif => notif.userInfo["isStart"] === false && notif.userInfo["workoutCount"] === workoutCount) && deliveredNotif.some(notif => notif.userInfo["isStart"] === true)) {
				// remove delivered start notif if end is delivered
				let deliveredNotifsToRemove = deliveredNotif.filter(notif => notif.userInfo["isStart"] === true).map(notif => notif.identifier);
				await Notification.removeDelivered(deliveredNotifsToRemove);
			}
			pendingNotif = (await Notification.allPending()).filter(notif => notif.threadIdentifier === Script.name());
			deliveredNotif = (await Notification.allDelivered()).filter(notif => notif.threadIdentifier === Script.name());
			// change state depending on current state and dismissed/delivered/pending notifs
			if (dataToday.state[workoutCount - 1] === WorkoutStates.NOT_STARTED && deliveredNotif.some(notif => notif.userInfo["workoutCount"] === workoutCount)) {
				// change state to pending if unanswered start notif
				dataToday.state[workoutCount - 1] = WorkoutStates.PENDING;
				dataChanged = true;
			} else if (dataToday.state[workoutCount - 1] === WorkoutStates.PENDING && deliveredNotif.every(notif => notif.userInfo["workoutCount"] !== workoutCount) && pendingNotif.some(notif => notif.userInfo["workoutCount"] === workoutCount)) {
				// change state to not started if dismissed start notif
				dataToday.state[workoutCount - 1] = WorkoutStates.NOT_STARTED;
				dataChanged = true;
			} else if (dataToday.state[workoutCount - 1] < WorkoutStates.DONE && deliveredNotif.every(notif => notif.userInfo["workoutCount"] !== workoutCount) && pendingNotif.every(notif => notif.userInfo["workoutCount"] !== workoutCount)) {
				// change state to skipped if not done and no more notifs for workout count (dismissed start and end notifs)
				dataChanged = dataChanged || dataToday.state[workoutCount - 1] !== WorkoutStates.SKIPPED;
				dataToday.state[workoutCount - 1] = WorkoutStates.SKIPPED;
			}
		}
		if (dataChanged) {
			console.log(`dataToday: ${JSON.stringify(dataToday)}`);
			updateAndSave();
		}
    } else {
		dataToday.date = df.string(todaysDate);
		dataToday.state = new Array(startTimes.length);
    }
	
	// add todays date to widget
    contentStack.addText(dataToday.date);
	
	// add state of each workout to widget
	const stackToday = contentStack.addStack();
	dataToday.state.forEach((stateEntry, stateIndex) => {
		const todaysWorkout = stackToday.addImage(SFSymbol.named(`${stateIndex+1}.circle`).image);	
		todaysWorkout.imageSize = new Size(contentStack.width / startTimes.length, contentStack.height / startTimes.length);
		todaysWorkout.tintColor = stateEntry == null ? Color.lightGray() : WorkoutStates.properties[stateEntry].color;
		stackToday.addSpacer(10);
	});
	// run widget
	if (!config.runsInWidget) {
	  await widget.presentSmall();
	}
	Script.setWidget(widget);
	Script.complete();
}

// helper func

// update and save data
function updateAndSave() {
	console.log(`saving data with ${data.length} entries`);
	data[0] = dataToday;
	fm.writeString(file, JSON.stringify(data));
}

// gets data for past n days
function getDataForPastNDays(n) {
	if (data.length > 0 && sameDay(todaysDate, df.date(data[0].date))) {
		return data.slice(1, n+1);
	}
	return data.slice(0, n);
}

// determines if two dates are on the same day
function sameDay(first, second) {
    return ((first.getFullYear() === second.getFullYear()) &&
			(first.getMonth() === second.getMonth()) &&
			(first.getDate() === second.getDate()));
}

// determines if given date is a weekday
function isWeekDay(d) {
	return ((d.getDay() > 0) // day 0 is sunday
		&& (d.getDay() < 6)); // day 6 is saturday
}

// gets today with hours and minutes set to the given time
function getDateTime(formattedTime) {
	let d = df.date(df.string(todaysDate));
	d.setHours(dft.date(formattedTime).getHours());
	d.setMinutes(dft.date(formattedTime).getMinutes());
	return d;
}

// creates a new notification
async function createNotification(date, reason, workoutCount, isStart) {
        console.log(`schedule notif on ${date.toLocaleString()} for ${reason}`);
		let notif = new Notification();
		notif.title = Script.name();
		notif.body = reason.toString();
		notif.openURL = URLScheme.forRunningScript();
		notif.sound = "popup";
		notif.threadIdentifier = Script.name();
        notif.userInfo = {"workoutCount": workoutCount, "isStart": isStart};
		let state = isStart ? WorkoutStates.STARTED : WorkoutStates.DONE;
		let stateProp = WorkoutStates.properties[state];
        notif.addAction(stateProp.name, `${URLScheme.forRunningScript()}?workoutCount=${workoutCount}&state=${stateProp.value}`, true);
		for (state in WorkoutStates) {
			state = WorkoutStates[state];
			if (state > WorkoutStates.DONE) {
				stateProp = WorkoutStates.properties[state];
				notif.addAction(stateProp.name, `${URLScheme.forRunningScript()}?workoutCount=${workoutCount}&state=${stateProp.value}`, true);
			}
		}
		notif.setTriggerDate(date);
		await notif.schedule();
	}

// calls the shortcut with the name hs: shortcut to got back to the homescreen
function backToHomeScreen(shortcutNameHomeScreen) {
	if (shortcutNameHomeScreen) {
		Safari.open(`shortcuts://run-shortcut?name=${shortcutNameHomeScreen}`);
	}
}


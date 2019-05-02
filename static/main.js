const baseURL = `${location.protocol}//${location.host}/`
const loginURL = baseURL + "login/"
const directoryURL = baseURL + "directory/"
const shiftURL = baseURL + "shifts"
const volInterval = 3600 * 1000
const emailInterval = 60000
const smsInterval = 60000
const shiftInterval = 60000

const loginForm = document.getElementById("loginForm")
loginForm.hidden = true

const username = document.getElementById("username")
const password = document.getElementById("password")

const main = document.getElementById("main")
main.hidden = true

const status = document.getElementById("status")
const shifts = document.getElementById("shifts")

function loadJSON(url, func, onerror) {
    let req = new XMLHttpRequest()
    req.open("GET", url)
    req.onload = () => {
        let j = null
        try {
            j = JSON.parse(req.response)
        }
        catch (err) {
            requireLogin()
        }
        if (j !== null) {
            func(j)
        }
    }
    req.onerror = () => {
        requireLogin()
        onerror
    }
    req.send()
}

const tasks = []

function startTask(func, interval) {
    tasks.push(setInterval(func, interval))
    func()
}

function startTasks() {
    for (let task of tasks) {
        clearInterval(task)
    }
    main.hidden = false
    startTask(loadVolunteers, volInterval)
    startTask(loadEmailStats, emailInterval)
    startTask(loadSmsStats, smsInterval)
    startTask(loadShifts, shiftInterval)
}

function requireLogin() {
    main.hidden = true
    loginForm.hidden = false
    status.innerText = "Awaiting login..."
}

window.onload = () => {
    loadJSON(baseURL + "authenticated/", (data) => {
        if (data) {
            startTasks()
        } else {
            requireLogin()
        }
    }, () => status.innerText = "Unable to ascertain authentication state.")
}

function volunteerLink(volunteer, altText) {
    let a = document.createElement("a")
    a.target = "_new"
    a.href = `https://www.3r.org.uk/directory/${volunteer.id}`
    let i = document.createElement("img")
    i.src = `${baseURL}thumb/${volunteer.id}`
    if (altText === undefined) {
        altText = "View in directory"
    }
    i.alt = altText
    a.appendChild(i)
    return a
}

function loadShifts() {
    let old = status.innerText
    status.innerText = "Loading shifts..."
    let newValue = status.innerText
    loadJSON(shiftURL, (data) => {
        while (shifts.childElementCount) {
            shifts.removeChild(shifts.firstChild)
        }
        for (let shift of data) {
            let h3 = document.createElement("h3")
            h3.style.textAlign = "center"
            h3.innerText = `${shift.name} (${shift.time})`
            shifts.appendChild(h3)
            let t = document.createElement("table")
            t.align = "center"
            let cols = shift.volunteers.length
            let rows = 0
            let data = []
            for (let i = 0; i < cols; i++) {
                let volunteer = shift.volunteers[i]
                let column = [
                    volunteer.name,
                    volunteerLink(volunteer)
                ]
                for (let detail of volunteer.details) {
                    column.push(`${detail.name}: ${detail.value}`)
                }
                data.push(column)
                rows = Math.max(rows, column.length)
            }
            for (let row = 0; row < rows; row++) {
                let r = document.createElement("tr")
                for (let col = 0; col < cols; col++) {
                    let tag = null
                    if (row) {
                        tag = "td"
                    } else {
                        tag = "th"
                    }
                    tag = document.createElement(tag)
                    tag.style.textAlign = "center"
                    let value = data[col][row]
                    if (value === undefined) {
                        value = document.createTextNode(" ")
                    } else if (typeof(value) == "string") {
                        value= document.createTextNode(value)
                    } else {
                        // Value is already a tag (hopefully).
                    }
                    tag.appendChild(value)
                    r.appendChild(tag)
                }
                t.appendChild(r)
            }
            shifts.appendChild(t)
        }
        if (status.innerText === newValue) {
            status.innerText = old
        }
    }, () => status.innerText = "Unable to load shifts.")
}

const listenersTable = document.getElementById("listeners")
const supportsTable = document.getElementById("supports")

function loadVolunteers() {
    status.innerText = "Loading volunteer list..."
    loadJSON(directoryURL, (data) => {
        data = data.volunteers
        status.innerText = `Volunteers last loaded ${new Date()}.`
        for (let tag of [listenersTable, supportsTable]) {
            while (tag.rows.length) {
                tag.deleteRow(0)
            }
        }
        for (let volunteer of data.sort((a, b) => a.id - b.id)) {
            let table = null
            let volunteerType = null
            if (volunteer.is_support_person) {
                volunteerType  = "support-volunteer"
                table = supportsTable
            } else {
                volunteerType  = "listening-volunteer"
                table = listenersTable
            }
            let row = table.rows[table.rows.length - 1]
            if (row === undefined || row.cells.length == 12) {
                row = document.createElement("tr")
                table.appendChild(row)
            }
            let cell = document.createElement("td")
            cell.id = volunteer.id
            cell.classList.add("volunteer")
            cell.classList.add(volunteerType)
            let span = document.createElement("span")
            span.style.textAlign = "center"
            span.innerText = volunteer.name
            cell.appendChild(span)
            cell.appendChild(document.createElement("br"))
            cell.appendChild(volunteerLink(volunteer))
            row.appendChild(cell)
        }
    }, () => status.innerText = "Could not get volunteer list.")
}

function loadTextTable(data, unanswered, oldest) {
    unanswered.innerText = data.unanswered
    let o = data.oldest
    let n = Number(o.split(":")[0])
    oldest.innerText = o
    let fs, bg = null
    if (n < 2) {
        fs = "medium"
        bg = "green"
    } else if (n < 3) {
        fs = "large"
        bg = "orange"
    } else if (n < 4) {
        fs = "x-large"
        bg = "red"
    } else {
        fs = "xx-large"
        bg = "black"
    }
    for (let style of [unanswered.style, oldest.style]) {
        style.color = "white"
        style.fontSize = fs
        style.background = bg
    }
}

function loadEmailStats() {
    loadJSON(
        baseURL + "email/",
        (data) => loadTextTable(data, document.getElementById("unansweredEmail"), document.getElementById("oldestEmail")),
        () => status.innerText = "Unable to retrieve email statistics"
    )
}

function loadSmsStats() {
    loadJSON(
        baseURL + "sms/",
        (data) => loadTextTable(data, document.getElementById("unansweredSms"), document.getElementById("oldestSms")),
        () => status.innerText = "Unable to retrieve SMS statistics"
    )
}

loginForm.onsubmit = (e) => {
    e.preventDefault()
    if (!username.value || !password.value) {
        alert("You must enter a valid 3 rings username and password.")
        username.focus()
    } else {
        let fd = new FormData()
        fd.append("username", username.value)
        fd.append("password", password.value)
        let req = new XMLHttpRequest()
        req.onerror = () => {
            alert("Setting username and password failed.")
            username.focus()
        }
        req.onload = () => {
            username.value = ""
            password.value = ""
            loginForm.hidden = true
            startTasks()
        }
        req.open("POST", loginURL)
        req.send(fd)
    }
}

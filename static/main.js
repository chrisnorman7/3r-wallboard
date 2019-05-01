const baseURL = `${location.protocol}//${location.host}/`
const loginURL = baseURL + "login/"
const directoryURL = baseURL + "directory/"
const volInterval = 3600 * 1000
const emailInterval = 60000

const loginForm = document.getElementById("loginForm")
loginForm.hidden = true

const username = document.getElementById("username")
const password = document.getElementById("password")

const main = document.getElementById("main")
main.hidden = true

const status = document.getElementById("status")
const volunteers = document.getElementById("volunteers")

function loadJSON(url, func, onerror) {
    let req = new XMLHttpRequest()
    req.open("GET", url)
    req.onload = () => func(JSON.parse(req.response))
    req.onerror = onerror
    req.send()
}

function startTasks() {
    main.hidden = false
    setInterval(loadVolunteers, volInterval)
    loadVolunteers()
    setInterval(loadEmailStats, emailInterval)
    loadEmailStats()
    setInterval(loadSmsStats, emailInterval)
    loadSmsStats()
}

window.onload = () => {
    loadJSON(baseURL + "authenticated/", (data) => {
        if (data) {
            startTasks()
        } else {
            loginForm.hidden = false
            status.innerText = "Awaiting login..."
        }
    }, () => status.innerText = "Could not ascertain authentication state.")
}

function loadVolunteers() {
    status.innerText = "Loading volunteer list..."
    loadJSON(directoryURL, (data) => {
        data = data.volunteers
        status.innerText = `Volunteers last loaded ${new Date()}.`
        for (let i = 0; i < volunteers.rows.length; i++) {
            volunteers.deleteRow(i)
        }
        let cellCounter = 0
        let row = null
        for (let volunteer of data.sort((a, b) => a.id - b.id)) {
            cellCounter += 1
            if (row === null) {
                row = document.createElement("tr")
                volunteers.appendChild(row)
            }
            let cell = document.createElement("td")
            cell.id = volunteer.id
            cell.classList.add("volunteer")
            let span = document.createElement("span")
            span.innerText = volunteer.name
            cell.appendChild(span)
            cell.appendChild(document.createElement("br"))
            let a = document.createElement("a")
            a.target = "_new"
            a.href = `https://www.3r.org.uk/directory/${volunteer.id}`
            let i = document.createElement("img")
            i.src = `${baseURL}thumb/${volunteer.id}`
            i.alt = "View in directory"
            a.appendChild(i)
            cell.appendChild(a)
            row.appendChild(cell)
            if (cellCounter == 12) {
                row = null
                cellCounter = 0
            }
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
    loadJSON(baseURL + "email/", (data) => {
        loadTextTable(data, document.getElementById("unansweredEmail"), document.getElementById("oldestEmail"))
    }, () => status.innerText = "Unable to retrieve email statistics")
}

function loadSmsStats() {
    loadJSON(baseURL + "sms/", (data) => loadTextTable(data, document.getElementById("unansweredSms"), document.getElementById("oldestSms")), () => status.innerText = "Unable to retrieve SMS statistics")
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

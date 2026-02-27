var commands = [];

function cmd(info, func) {
    var data = info;
    data.function = func;
    if (!data.category) data.category = 'misc';
    commands.push(data);
    return data;
}

module.exports = {
    cmd,
    commands
};
